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
import { latexToMathML } from "@/lib/katex-render";
import { reviewThresholdFor, isVisionTypeInDomain } from "@/lib/pdf/subject-affinity";

// Backward-compat export — pour anciens consommateurs. Threshold reel calcule
// dynamiquement par reviewThresholdFor(visionType, subject).
export const REVIEW_CONFIDENCE_THRESHOLD = 0.8;

// Labels lisibles pour les subject_enum (utilises dans le prompt Sonnet).
const SUBJECT_LABELS: Record<string, string> = {
  mathematiques: "mathématiques",
  chimie: "chimie",
  physique: "physique",
  biologie: "biologie",
  histoire: "histoire",
  geographie: "géographie",
  religion: "religion",
  francais: "français",
  neerlandais: "néerlandais",
  anglais: "anglais",
  allemand: "allemand",
  latin: "latin",
  economie: "économie",
  arts: "arts plastiques",
  musique: "musique",
};

function subjectLabel(subjectEnum: string | null): string {
  if (!subjectEnum) return "matière inconnue";
  return SUBJECT_LABELS[subjectEnum] ?? subjectEnum;
}

function levelLabel(level: number | null): string {
  if (level === null) return "secondaire";
  return `${level}e année secondaire`;
}

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
  subjectEnum: string | null,
  level: number | null,
  chapterTitle: string,
): string {
  const subj = subjectLabel(subjectEnum);
  const lvl = levelLabel(level);
  const inDomain = isVisionTypeInDomain(visionType, subjectEnum);

  // Note critique anti-hallucination : Vision Haiku peut se tromper sur le type
  // d'image (cas observe : tour avec toit conique dans cours de math classee
  // "monument_architectural"). Si le type detecte est hors-domaine pour la
  // matiere, on dit a Sonnet de retourner null plutot que de generer une
  // question hors-sujet.
  const domainNote = inDomain
    ? ""
    : `\n\n⚠️ ATTENTION : Vision a classifie cette image comme "${visionType}" mais le cours est de ${subj}. C'est probablement une erreur de classification (Vision a vu une forme visuelle qui ressemble a ${visionType} mais le PDF traite un autre sujet). PRIORITE : si tu peux generer une question pertinente pour le chapitre ${subj} a partir de cette image, fais-le. Sinon retourne {"skip": true, "reason": "image hors-sujet ${visionType} dans cours ${subj}"} (objet JSON, pas null).`;

  return `Tu es un createur de questions pedagogique CESS Belgique FWB (${lvl}).
Matiere : ${subj}.
Chapitre : "${chapterTitle}".

Image type detecte par Vision : ${visionType}
Description Vision :
${description}

OCR (texte present dans l'image) :
${ocrText}

Contexte du chapitre (extrait du texte autour de l'image dans le PDF) :
${chapterContext.slice(0, 1500)}
${domainNote}

Genere 1 question pedagogique image-aware ALIGNEE SUR LE CHAPITRE et la MATIERE (${subj}). Type prefere : ${preferredType}.

Regle d'or anti-hallucination : la question DOIT etre pertinente pour un cours de ${subj} au niveau ${lvl}. Si l'image (selon description Vision) ne se prete pas a une question ${subj} pertinente pour ce chapitre, retourne {"skip": true, "reason": "..."} (JSON court). Ne genere PAS une question hors-sujet.

Pour les types identification (scene/portrait/map/molecule/diagram) : OBLIGATOIREMENT MCQ avec 4 choix CANONIQUES (4 evenements/personnages/regions/molecules plausibles de la periode/matiere). Pas de question ouverte. Cela bloque les hallucinations.

Reponds en JSON strict (aucun texte hors JSON, pas de code fence). Soit :

A) Question generee :
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

B) Skip explicit (image hors-sujet) :
{
  "skip": true,
  "reason": "Briefe explication de pourquoi cette image ne convient pas a une question ${subj}"
}

Regles selon type (cas A) :
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
  // Skip path : Sonnet retourne {skip: true, reason: "..."} si image hors-sujet
  skip?: unknown;
  reason?: unknown;
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
    args.course.subject_enum ?? null,
    args.course.level ?? null,
    args.chapterTitle,
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
  if (!parsed) return null;

  // Sonnet a explicitement skip cette image (hors-sujet pour la matiere).
  // C'est le bon comportement : pas de question hors-sujet inseree, prof
  // ne voit meme pas l'image en question.
  if (parsed.skip === true) {
    // eslint-disable-next-line no-console
    console.log(
      `[image-questions] Sonnet skip image (page ${args.pageNumber}, type ${args.visionType}, subject ${args.course.subject_enum}) : ${typeof parsed.reason === "string" ? parsed.reason : "no reason"}`,
    );
    return null;
  }

  if (typeof parsed.question !== "string" || !parsed.question.trim()) {
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
    formula_mathml: args.latexIfFormula ? latexToMathML(args.latexIfFormula) : null,
    molecule_smiles: args.smilesIfMolecule,
    geo_topojson_path: mapRegionToTopoJson(args.topojsonRegionHint),
    // Threshold dynamique : 0.95 pour types hors-domaine (ex: religious_symbol
    // dans cours math), 0.80 pour types in-domaine. Force needs_review sur les
    // images douteuses meme avec confidence Vision moderement haute.
    needs_review: args.confidence < reviewThresholdFor(args.visionType, args.course.subject_enum ?? null),
  };
}
