// Pipeline B : pour chaque image classifiee, generer 1 question image-aware
// avec MCQ canoniques anti-hallucination (cf spec section 4.5 - Option A).
//
// Strategy : description Haiku (deja faite en PR 5) + Sonnet text-only avec
// description en input. Coût : ~$0.006 par image vs $0.015 si Sonnet Vision direct.
// Trade-off : Sonnet ne voit pas l'image, s'appuie sur description ; pour
// niveau CESS FWB c'est suffisant a 90-95%.

import Anthropic from "@anthropic-ai/sdk";
import type { ImageType } from "@/lib/pdf/image-types";
import type { TeacherQuestionInsertRow } from "@/lib/db/teacher-questions";

export const REVIEW_CONFIDENCE_THRESHOLD = 0.8;

type QuestionTypeForVision = "mcq" | "numeric" | "short_text";

function pickQuestionType(visionType: ImageType): QuestionTypeForVision {
  if (visionType.startsWith("formula_") || visionType === "geometric_figure") {
    // Math/physique/chimie : numeric pour calcul, mcq pour identification
    return "numeric";
  }
  if (visionType === "linguistic_table") return "short_text";
  if (
    visionType === "table_data" ||
    visionType.endsWith("_graph") ||
    visionType.endsWith("_chart")
  ) {
    return "numeric";
  }
  // Identification (scene/portrait/map/molecule/diagram) : MCQ canonique pour
  // bloquer hallucinations Sonnet (cf spec section 4.5).
  return "mcq";
}

function buildPrompt(
  visionType: ImageType,
  description: string,
  ocrText: string,
  chapterContext: string,
  preferredType: QuestionTypeForVision,
): string {
  return `Tu es un createur de questions pedagogique CESS Belgique FWB (16-18 ans).

Image type=${visionType}, description :
${description}

OCR : ${ocrText}

Contexte chapitre (extraits) :
${chapterContext.slice(0, 800)}

Genere 1 question pedagogique image-aware. Type prefere : ${preferredType}.

Pour les types identification (scene/portrait/map/molecule/diagram) : OBLIGATOIREMENT MCQ avec 4 choix CANONIQUES (4 evenements/personnages/regions/molecules plausibles de la periode/matiere). Pas de question ouverte. Cela bloque les hallucinations.

Reponds en JSON strict (aucun texte hors JSON, pas de code fence) :
{
  "type": "${preferredType}",
  "question": "...",
  "options": ["A", "B", "C", "D"],
  "answer_index": 0,
  "expected_numeric_answer": 12.5,
  "numeric_tolerance": 0.1,
  "numeric_unit": "g/mol",
  "expected_text_answers": ["..."],
  "explanation": "...",
  "difficulty": 2
}

Regles selon type :
- mcq : remplir "options" (4 strings) + "answer_index" (0-3). Laisser expected_numeric_answer/text_answers a null.
- numeric : remplir expected_numeric_answer + numeric_tolerance (defaut 0.01) + numeric_unit. Laisser options vide.
- short_text : remplir expected_text_answers (1-5 variantes). Laisser options vide.

difficulty : 1 (facile) | 2 (moyen) | 3 (difficile).`;
}

type AnyParsed = {
  type?: unknown;
  question?: unknown;
  options?: unknown;
  answer_index?: unknown;
  expected_numeric_answer?: unknown;
  numeric_tolerance?: unknown;
  numeric_unit?: unknown;
  expected_text_answers?: unknown;
  explanation?: unknown;
  difficulty?: unknown;
};

function parseJson(raw: string): AnyParsed | null {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch { /* try fence */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* try greedy */ }
  }
  const greedy = trimmed.match(/\{[\s\S]*\}/);
  if (greedy?.[0]) {
    try { return JSON.parse(greedy[0]); } catch { /* give up */ }
  }
  return null;
}

const TOPOJSON_MAP: Record<string, string> = {
  Belgique: "/topojson/belgium.json",
  Wallonie: "/topojson/wallonia.json",
  Bruxelles: "/topojson/brussels.json",
  Europe: "/topojson/europe.json",
  Monde: "/topojson/world.json",
};

function mapRegionToTopoJson(region: string | null): string | null {
  if (!region) return null;
  return TOPOJSON_MAP[region] ?? null;
}

export type GenerateImageQuestionArgs = {
  imageHash: string;
  imageUrl: string;
  visionType: ImageType;
  description: string;
  ocrText: string;
  confidence: number;
  latexIfFormula: string | null;
  smilesIfMolecule: string | null;
  topojsonRegionHint: string | null;
  pageNumber: number;
  chapterTitle: string;
  chapterContext: string;
  job: { teacher_id: string; school_id: string };
  course: { id: string; subject_enum: string | null; level: number | null; organization_tags: string[] | null };
};

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/**
 * Generate 1 image-aware question via Sonnet 4.6 text-only (Option A).
 * Sonnet sees description + OCR + chapter context — not the image itself.
 * Returns null if generation fails or response invalid.
 * Cost: ~$0.005 per image (Sonnet text-only).
 */
export async function generateImageQuestion(
  args: GenerateImageQuestionArgs,
): Promise<TeacherQuestionInsertRow | null> {
  const preferredType = pickQuestionType(args.visionType);
  const prompt = buildPrompt(
    args.visionType,
    args.description,
    args.ocrText,
    args.chapterContext,
    preferredType,
  );

  let text: string;
  try {
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  } catch {
    return null;
  }

  const parsed = parseJson(text);
  if (!parsed || typeof parsed.question !== "string" || !parsed.question.trim()) {
    return null;
  }

  const type: "mcq" | "numeric" | "short_text" =
    parsed.type === "numeric" || parsed.type === "short_text" ? parsed.type : "mcq";

  // MCQ : need 4 valid string options
  let options: string[] = [];
  let answerIndex = 0;
  if (type === "mcq") {
    if (Array.isArray(parsed.options)) {
      options = parsed.options
        .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
        .slice(0, 4);
    }
    if (options.length !== 4) return null;
    if (
      typeof parsed.answer_index === "number" &&
      Number.isInteger(parsed.answer_index) &&
      parsed.answer_index >= 0 &&
      parsed.answer_index <= 3
    ) {
      answerIndex = parsed.answer_index;
    }
  }

  // Numeric : need a finite number
  let numericAnswer: number | null = null;
  let numericTolerance: number | null = null;
  let numericUnit: string | null = null;
  if (type === "numeric") {
    if (
      typeof parsed.expected_numeric_answer !== "number" ||
      !Number.isFinite(parsed.expected_numeric_answer)
    ) {
      return null;
    }
    numericAnswer = parsed.expected_numeric_answer;
    numericTolerance =
      typeof parsed.numeric_tolerance === "number" &&
      Number.isFinite(parsed.numeric_tolerance)
        ? parsed.numeric_tolerance
        : 0.01;
    numericUnit =
      typeof parsed.numeric_unit === "string" && parsed.numeric_unit.length > 0
        ? parsed.numeric_unit
        : null;
  }

  // short_text : need 1-5 string answers
  let textAnswers: string[] | null = null;
  if (type === "short_text") {
    if (!Array.isArray(parsed.expected_text_answers)) return null;
    textAnswers = parsed.expected_text_answers
      .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
      .slice(0, 5);
    if (textAnswers.length === 0) return null;
  }

  const difficulty =
    typeof parsed.difficulty === "number" &&
    Number.isInteger(parsed.difficulty) &&
    parsed.difficulty >= 1 &&
    parsed.difficulty <= 3
      ? parsed.difficulty
      : null;

  return {
    teacher_id: args.job.teacher_id,
    school_id: args.job.school_id,
    course_id: args.course.id,
    subject: null,
    subject_enum: args.course.subject_enum ?? null,
    level: args.course.level ?? null,
    type,
    question: parsed.question.trim(),
    options: type === "mcq" ? options : [],
    answer_index: type === "mcq" ? answerIndex : 0,
    expected_numeric_answer: numericAnswer,
    numeric_tolerance: numericTolerance,
    numeric_unit: numericUnit,
    expected_text_answers: textAnswers,
    explanation: typeof parsed.explanation === "string" ? parsed.explanation : null,
    period: args.chapterTitle,
    difficulty_stars: difficulty,
    organization_tags: args.course.organization_tags ?? [],
    is_ai_generated: true,
    is_public: false,
    page_range_start: args.pageNumber,
    page_range_end: args.pageNumber,
    concept_page_hint: args.pageNumber,
    // Pipeline B fields
    image_url: args.imageUrl,
    image_hash: args.imageHash,
    image_page_number: args.pageNumber,
    image_description_md: args.description,
    image_confidence: args.confidence,
    vision_type: args.visionType,
    formula_latex: args.latexIfFormula,
    formula_mathml: null, // Filled UI-side via KaTeX in PR 7
    molecule_smiles: args.smilesIfMolecule,
    geo_topojson_path: mapRegionToTopoJson(args.topojsonRegionHint),
    needs_review: args.confidence < REVIEW_CONFIDENCE_THRESHOLD,
  };
}
