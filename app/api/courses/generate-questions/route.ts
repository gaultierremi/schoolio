import { NextRequest, NextResponse } from "next/server";
import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { routeAIRequest, GracefulAIError } from "@/lib/ai-router";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { isValidSubject, isValidLevel, SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId, SchoolLevel } from "@/lib/subjects";
import { extractPagesFromPdf } from "@/lib/pdf/extract-pages";
import { logActivity } from "@/lib/activity/log";
import { logError } from "@/lib/observability/log-error";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// LEGACY ANTHROPIC IMPLEMENTATION (kept for reference)
/*
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic();
const message = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  system: buildSystemPrompt(subject, level),
  messages: [{
    role: "user",
    content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
      { type: "text", text: `Genere ${questionsCount} questions de quiz basees sur ce document.` },
    ],
  }],
});
*/

const UUID_REGEX = /^[0-9a-f-]{36}$/i;
// Gemini Vision (Files API direct base64) limite la taille du PDF à ~20MB.
// Au-delà, l'inférence échoue silencieusement (réponse vide → 0 question).
// Cap explicitement avec un message d'erreur clair pour le prof.
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB Gemini Vision limit
// Scale parallèle : auto-ajuste selon le volume demandé (cf. computeWorkerLayout).
// Plafond raisonnable pour éviter de saturer Anthropic/Gemini en parallèle.
const MAX_WORKERS = 10;
const QUESTIONS_PER_WORKER = 30;

// Cible automatique de questions = min(MAX_QUESTIONS_PER_COURSE, pages × 3)
// Pour un syllabus FWB typique (50-200 pages), donne 150-600 questions —
// couverture solide sans gaspiller du budget IA.
function autoTargetQuestions(pagesCount: number | null): number {
  if (!pagesCount || pagesCount < 1) return 30; // fallback minimal si pages_count absent
  return Math.min(MAX_QUESTIONS_PER_COURSE, Math.ceil(pagesCount * 3));
}

function computeWorkerLayout(target: number): { workerCount: number; questionsPerWorker: number } {
  const workerCount = Math.min(MAX_WORKERS, Math.max(1, Math.ceil(target / QUESTIONS_PER_WORKER)));
  const questionsPerWorker = Math.ceil(target / workerCount);
  return { workerCount, questionsPerWorker };
}

// Cap du nombre total de questions par cours.
// Raison : limiter les couts Anthropic a l'echelle et encourager la curation
// qualitative du prof plutot que l'accumulation brute de questions IA.
const MAX_QUESTIONS_PER_COURSE = 600;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const THEME_INSTRUCTIONS: Partial<Record<SubjectId, string>> = {
  histoire:
    "Pour le champ period, utilise l'une de ces periodes : Prehistoire, Antiquite, Moyen Age, Renaissance, XVIe siecle, XVIIe siecle, XVIIIe siecle, XIXe siecle, XXe siecle, XXIe siecle, Autre.",
  chimie:
    "Pour le champ period, utilise l'un de ces themes : Atomes et molecules, Reactions chimiques, Stoechiometrie, Acides et bases, Chimie organique, Liaisons chimiques, Tableau periodique, Autre.",
  physique:
    "Pour le champ period, utilise l'un de ces themes : Mecanique, Energie, Electricite, Optique, Thermodynamique, Ondes, Autre.",
  biologie:
    "Pour le champ period, utilise l'un de ces themes : Cellule, Genetique, Evolution, Ecosystemes, Anatomie humaine, Physiologie, Autre.",
};

// Distribution des types de questions par categorie de matiere.
// Adapte la diversification au contexte pedagogique de chaque discipline.
const TYPE_DISTRIBUTION_BY_SUBJECT: Record<string, string> = {
  mathematiques:
    "Distribue les questions : ~50% numeric (reponse numerique precise), ~30% mcq, ~20% short_text.",
  chimie:
    "Distribue les questions : ~50% numeric (valeurs, masses molaires, concentrations), ~30% mcq, ~20% short_text.",
  physique:
    "Distribue les questions : ~50% numeric (calculs de forces, energies, vitesses), ~30% mcq, ~20% short_text.",
  histoire:
    "Distribue les questions : ~70% mcq, ~30% short_text (dates, personnages, lieux).",
  geographie:
    "Distribue les questions : ~70% mcq, ~30% short_text (pays, capitales, fleuves).",
  francais:
    "Distribue les questions : ~50% short_text (definitions, completions de phrases), ~50% mcq.",
  anglais:
    "Distribue les questions : ~50% short_text (traductions courtes, completions), ~50% mcq.",
  neerlandais:
    "Distribue les questions : ~50% short_text (traductions courtes, completions), ~50% mcq.",
  langues:
    "Distribue les questions : ~50% short_text (traductions courtes, completions), ~50% mcq.",
  litterature:
    "Distribue les questions : ~50% short_text (titres, auteurs, personnages), ~50% mcq.",
  biologie:
    "Distribue les questions : ~60% mcq, ~30% short_text (noms de structures, processus), ~10% numeric.",
  sciences:
    "Distribue les questions : ~60% mcq, ~30% short_text, ~10% numeric.",
};

function getTypeDistributionInstruction(subject: SubjectId): string {
  return (
    TYPE_DISTRIBUTION_BY_SUBJECT[subject] ??
    "Distribue les questions : ~60% mcq, ~25% short_text, ~15% numeric."
  );
}

function getLevelInstruction(level: SchoolLevel | null): string {
  if (!level) return "";
  if (level <= 2) {
    return "Cours de debut de secondaire (eleves 12-14 ans). Vocabulaire et notions fondamentales, questions directes et concretes.";
  }
  if (level <= 4) {
    return "Cours de milieu de secondaire (eleves 14-16 ans). Comprehension, applications de concepts, mises en contexte.";
  }
  return "Cours de fin de secondaire (eleves 16-18 ans). Analyse, synthese, raisonnement, questions a plusieurs etapes.";
}

function buildSystemPrompt(subject: SubjectId, level: SchoolLevel | null): string {
  const subjectLabel = SUBJECTS_BY_ID[subject].label;
  const levelInstruction = getLevelInstruction(level);
  const themeInstruction =
    THEME_INSTRUCTIONS[subject] ??
    "Pour le champ period, identifie le theme principal de chaque question dans le document.";
  const levelClause = levelInstruction ? ` ${levelInstruction}` : "";
  const typeDistribution = getTypeDistributionInstruction(subject);

  return (
    `Tu es un assistant pedagogique. Analyse ce document et genere des questions de quiz pertinentes pour un cours de ${subjectLabel}.${levelClause}` +
    ` Reponds UNIQUEMENT en JSON valide avec ce format exact :` +
    ` {"page_count": 12, "questions": [...]}.` +
    ` Trois types de questions sont possibles :` +
    ` 1) mcq : {"type":"mcq","question":"...","options":["A","B","C","D"],"answer_index":0,"explanation":"...","period":"...","difficulty":2,"concept_page_hint":3}` +
    ` 2) numeric : {"type":"numeric","question":"...","expected_numeric_answer":42.5,"numeric_tolerance":0.5,"numeric_unit":"m/s","explanation":"...","period":"...","difficulty":2,"concept_page_hint":3}` +
    ` 3) short_text : {"type":"short_text","question":"...","expected_text_answers":["reponse1","reponse2"],"explanation":"...","period":"...","difficulty":2,"concept_page_hint":3}` +
    ` Regles : mcq doit avoir exactement 4 choix, answer_index entre 0 et 3.` +
    ` numeric : expected_numeric_answer est obligatoire (nombre), numeric_tolerance optionnel (defaut 0.01), numeric_unit optionnel (string).` +
    ` short_text : expected_text_answers est obligatoire (tableau de 1 a 5 reponses acceptables, inclure variantes orthographiques/synonymes).` +
    ` difficulty doit etre 1, 2 ou 3.` +
    ` ${typeDistribution}` +
    ` Les questions doivent etre claires, pedagogiques, variees et directement liees au contenu du document.` +
    ` ${themeInstruction}` +
    ` Dans le champ page_count, indique le nombre total de pages du document.` +
    ` Dans le champ concept_page_hint, indique le numero de la page du document qui contient la THEORIE expliquant le concept teste par la question (pas la page de l'exercice, mais la page du cours/fiches qui explique la notion). Si tu ne peux pas identifier clairement une page theorique distincte, utilise la premiere page de la plage de pages concernee.`
  );
}

type QuestionType = "mcq" | "numeric" | "short_text";

type ExtractedQuestion = {
  type: QuestionType;
  question: string;
  // mcq fields
  options?: string[];
  answer_index?: number;
  // numeric fields
  expected_numeric_answer?: number;
  numeric_tolerance?: number;
  numeric_unit?: string;
  // short_text fields
  expected_text_answers?: string[];
  // common
  explanation: string;
  period: string;
  difficulty?: number;
  concept_page_hint?: number | null;
};

type CourseRow = {
  id: string;
  teacher_id: string;
  school_id: string;
  subject_enum: string | null;
  level: number | null;
  pdf_storage_path: string | null;
  organization_tags: string[] | null;
  pages_count: number | null;
};

type PageRange = { start: number; end: number };

const QUESTIONS_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    page_count: { type: SchemaType.INTEGER },
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["mcq", "numeric", "short_text"],
          },
          question: { type: SchemaType.STRING },
          // mcq
          options: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          answer_index: { type: SchemaType.INTEGER },
          // numeric
          expected_numeric_answer: { type: SchemaType.NUMBER },
          numeric_tolerance: { type: SchemaType.NUMBER },
          numeric_unit: { type: SchemaType.STRING },
          // short_text
          expected_text_answers: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          // common
          explanation: { type: SchemaType.STRING },
          period: { type: SchemaType.STRING },
          difficulty: { type: SchemaType.INTEGER },
          concept_page_hint: { type: SchemaType.INTEGER },
        },
        required: ["type", "question", "explanation", "period", "difficulty"],
      },
    },
  },
  required: ["page_count", "questions"],
};

function parseJsonObject<T>(rawText: string): T {
  const trimmed = rawText.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {}

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as T;
    } catch {}
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) {
    return JSON.parse(jsonMatch[0]) as T;
  }

  throw new Error("Reponse JSON invalide");
}

async function generateQuestionsWithFallback(
  pdfBase64: string,
  systemPrompt: string,
  workerIndex: number,
  workerCount: number,
  questionsPerWorker: number,
): Promise<string> {
  const fullPrompt =
    `${systemPrompt}\n\n` +
    `Worker ${workerIndex + 1}/${workerCount}: genere ${questionsPerWorker} questions distinctes (mcq, numeric et/ou short_text selon la matiere). ` +
    `Evite les doublons et couvre une partie differente du document. ` +
    `IMPORTANT : pour chaque question, place dans le champ "period" le nom EXACT du chapitre, UAA, theme ou section du syllabus dont la question est tiree (ex: "UAA 2 : Cone", "Chapitre 3 - Reactions acides-bases", "Antiquite"). Ce champ sera utilise pour grouper les questions par theme dans l'interface prof.`;

  const response = await routeAIRequest("generate_questions", fullPrompt, {
    pdfBase64,
    requireVision: true,
    responseSchema: QUESTIONS_SCHEMA,
    maxTokens: 32768,
    cacheTtlMs: 0,
  });
  return response.text;
}

function normalizeMcqQuestion(question: ExtractedQuestion): ExtractedQuestion | null {
  const options = Array.isArray(question.options) ? question.options.slice(0, 4) : [];
  while (options.length < 4) options.push("");
  if (!options.every(Boolean)) return null;

  const answerIndex =
    Number.isInteger(question.answer_index) &&
    question.answer_index! >= 0 &&
    question.answer_index! <= 3
      ? question.answer_index!
      : 0;

  return {
    type: "mcq",
    question: question.question,
    options,
    answer_index: answerIndex,
    explanation: question.explanation,
    period: question.period,
    difficulty: question.difficulty,
    concept_page_hint: question.concept_page_hint,
  };
}

function normalizeNumericQuestion(question: ExtractedQuestion): ExtractedQuestion | null {
  if (
    typeof question.expected_numeric_answer !== "number" ||
    !Number.isFinite(question.expected_numeric_answer)
  ) {
    console.warn(
      `[generate-questions] numeric question skipped — expected_numeric_answer manquant ou invalide: "${question.question}"`
    );
    return null;
  }

  const tolerance =
    typeof question.numeric_tolerance === "number" && Number.isFinite(question.numeric_tolerance)
      ? question.numeric_tolerance
      : 0.01;

  const unit =
    typeof question.numeric_unit === "string" && question.numeric_unit.length > 0
      ? question.numeric_unit
      : undefined;

  return {
    type: "numeric",
    question: question.question,
    expected_numeric_answer: question.expected_numeric_answer,
    numeric_tolerance: tolerance,
    numeric_unit: unit,
    explanation: question.explanation,
    period: question.period,
    difficulty: question.difficulty,
    concept_page_hint: question.concept_page_hint,
  };
}

function normalizeShortTextQuestion(question: ExtractedQuestion): ExtractedQuestion | null {
  const answers = Array.isArray(question.expected_text_answers)
    ? question.expected_text_answers.filter((a) => typeof a === "string" && a.trim().length > 0).slice(0, 5)
    : [];

  if (answers.length === 0) {
    console.warn(
      `[generate-questions] short_text question skipped — expected_text_answers vide ou absent: "${question.question}"`
    );
    return null;
  }

  return {
    type: "short_text",
    question: question.question,
    expected_text_answers: answers,
    explanation: question.explanation,
    period: question.period,
    difficulty: question.difficulty,
    concept_page_hint: question.concept_page_hint,
  };
}

function normalizeQuestion(question: ExtractedQuestion): ExtractedQuestion | null {
  if (typeof question.question !== "string" || !question.question.trim()) return null;

  const rawDifficulty = question.difficulty;
  const difficulty =
    typeof rawDifficulty === "number" &&
    Number.isInteger(rawDifficulty) &&
    rawDifficulty >= 1 &&
    rawDifficulty <= 3
      ? rawDifficulty
      : undefined;

  const base = {
    ...question,
    question: question.question.trim(),
    explanation: typeof question.explanation === "string" ? question.explanation : "",
    period: typeof question.period === "string" ? question.period : "",
    difficulty,
  };

  switch (question.type) {
    case "mcq":
      return normalizeMcqQuestion(base);
    case "numeric":
      return normalizeNumericQuestion(base);
    case "short_text":
      return normalizeShortTextQuestion(base);
    default:
      // Unknown type from AI — treat as mcq if options are present, else skip
      if (Array.isArray((question as ExtractedQuestion).options)) {
        return normalizeMcqQuestion({ ...base, type: "mcq" });
      }
      return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("[courses/generate-questions]", userError);
      return NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { data: isTeacher, error: teacherError } = await supabase.rpc(
      "is_current_user_school_teacher"
    );
    if (teacherError) {
      console.error("[courses/generate-questions]", teacherError);
      return NextResponse.json({ error: "Erreur de verification professeur" }, { status: 500 });
    }
    if (isTeacher !== true) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    const body = (await request.json()) as {
      courseId?: unknown;
      questionsCount?: unknown;
      page_range?: unknown;
    };
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    // Cap raised : peut atteindre 600 questions par call (MAX_QUESTIONS_PER_COURSE).
    // Si questionsCount non fourni, on auto-scale plus tard depuis pages_count
    // une fois le cours fetché.
    const requestedQuestionsCount =
      typeof body.questionsCount === "number" && body.questionsCount > 0
        ? Math.min(body.questionsCount, MAX_QUESTIONS_PER_COURSE)
        : null;

    let pageRange: PageRange | null = null;
    if (body.page_range !== null && typeof body.page_range === "object") {
      const pr = body.page_range as Record<string, unknown>;
      if (typeof pr.start === "number" && typeof pr.end === "number") {
        pageRange = { start: Math.round(pr.start), end: Math.round(pr.end) };
      }
    }

    if (!UUID_REGEX.test(courseId)) {
      return NextResponse.json({ error: "courseId invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id, teacher_id, school_id, subject_enum, level, pdf_storage_path, organization_tags, pages_count")
      .eq("id", courseId)
      .limit(1)
      .maybeSingle();

    if (courseError) throw courseError;
    if (!course) {
      return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });
    }

    const typedCourse = course as CourseRow;

    if (typedCourse.teacher_id !== user.id) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }
    if (!typedCourse.pdf_storage_path) {
      return NextResponse.json({ error: "Aucun PDF associe a ce cours" }, { status: 400 });
    }

    // Cap 600 questions par cours — verifier le compteur avant de generer
    const { count: currentCount, error: countError } = await admin
      .from("teacher_questions")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId);

    if (countError) {
      console.error("[courses/generate-questions] count error:", countError);
      return NextResponse.json({ error: "Erreur lors de la verification du plafond" }, { status: 500 });
    }

    const existing = currentCount ?? 0;
    if (existing >= MAX_QUESTIONS_PER_COURSE) {
      return NextResponse.json(
        {
          error:
            "Plafond 600 questions/cours atteint. Archive ou supprime des questions pour liberer de la place.",
        },
        { status: 400 }
      );
    }

    // Cible automatique si requestedQuestionsCount null : auto-scale depuis
    // pages_count. Capé par la place disponible avant MAX_QUESTIONS_PER_COURSE.
    const targetQuestions =
      requestedQuestionsCount ?? autoTargetQuestions(typedCourse.pages_count ?? null);
    const cappedQuestionsCount = Math.min(targetQuestions, MAX_QUESTIONS_PER_COURSE - existing);
    const { workerCount, questionsPerWorker } = computeWorkerLayout(cappedQuestionsCount);

    const { data: pdfBlob, error: downloadError } = await admin.storage
      .from("course-pdfs")
      .download(typedCourse.pdf_storage_path);

    if (downloadError || !pdfBlob) {
      console.error("[courses/generate-questions]", downloadError);
      return NextResponse.json({ error: "Impossible de telecharger le PDF" }, { status: 500 });
    }

    const fullPdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
    if (fullPdfBuffer.byteLength > MAX_PDF_BYTES) {
      const sizeMB = (fullPdfBuffer.byteLength / 1024 / 1024).toFixed(1);
      return NextResponse.json(
        {
          error: `PDF de ${sizeMB}MB trop volumineux pour la génération (max 20MB). Split le syllabus en plusieurs PDF plus petits, ou utilise l'option "Sélection de pages" pour traiter par chapitre.`,
        },
        { status: 400 }
      );
    }

    // Validate page range if provided
    if (pageRange !== null) {
      if (pageRange.start < 1 || pageRange.end < pageRange.start) {
        return NextResponse.json({ error: "Plage de pages invalide" }, { status: 400 });
      }
      if (typedCourse.pages_count && pageRange.end > typedCourse.pages_count) {
        return NextResponse.json(
          { error: `La plage depasse le nombre de pages du PDF (${typedCourse.pages_count})` },
          { status: 400 }
        );
      }
    }

    // Extract page subset if requested, fallback to full PDF on error
    let pdfBuffer: Buffer = fullPdfBuffer;
    if (pageRange !== null) {
      try {
        const extracted = await extractPagesFromPdf({
          pdfBuffer: fullPdfBuffer,
          startPage: pageRange.start,
          endPage: pageRange.end,
        });
        pdfBuffer = Buffer.from(extracted);
      } catch (err) {
        console.warn("[generate-questions] Extraction pages echouee, fallback PDF entier:", err);
        pageRange = null;
      }
    }

    const pdfBase64 = pdfBuffer.toString("base64");

    const subject: SubjectId = isValidSubject(typedCourse.subject_enum)
      ? typedCourse.subject_enum
      : "histoire";
    const level: SchoolLevel | null = isValidLevel(typedCourse.level)
      ? typedCourse.level
      : null;
    const systemPrompt = buildSystemPrompt(subject, level);

    const pageRangePromptSuffix = pageRange !== null
      ? ` Le contenu fourni correspond aux pages ${pageRange.start} a ${pageRange.end} du document original.`
      : "";
    const promptWithRange = systemPrompt + pageRangePromptSuffix;

    const workerOutputs = await Promise.all(
      Array.from({ length: workerCount }, (_, workerIndex) =>
        generateQuestionsWithFallback(pdfBase64, promptWithRange, workerIndex, workerCount, questionsPerWorker)
      )
    );

    const parsedOutputs = workerOutputs.map((rawText) =>
      parseJsonObject<{ questions: ExtractedQuestion[]; page_count?: number }>(rawText)
    );
    const rawQuestions = parsedOutputs.flatMap((output) =>
      Array.isArray(output.questions) ? output.questions : []
    );
    const normalized = rawQuestions.map(normalizeQuestion);
    const questions = normalized
      .filter((q): q is ExtractedQuestion => q !== null)
      .slice(0, cappedQuestionsCount);

    if (questions.length === 0) {
      // Observability : on log les compteurs pour comprendre POURQUOI (Gemini
      // n'a rien renvoyé, ou tout a été filtré en normalize). Sans ça on a
      // un 500 opaque côté UI.
      const rawTypes = rawQuestions.reduce<Record<string, number>>((acc, q) => {
        const t = (q?.type ?? "unknown") as string;
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {});
      await logError(new Error("generate-questions: 0 questions after normalize"), {
        source: "api.courses.generate-questions.POST",
        context: {
          courseId,
          subject,
          level,
          pageRange,
          rawCount: rawQuestions.length,
          rawTypeDistribution: rawTypes,
          normalizedNullCount: normalized.filter((n) => n === null).length,
          cappedQuestionsCount,
          pdfSizeBytes: fullPdfBuffer.byteLength,
        },
        userId: user.id,
      });
      return NextResponse.json(
        {
          error:
            rawQuestions.length > 0
              ? "Aucune question valide générée (toutes filtrées par validation). Réessaie ou réduis la plage de pages."
              : "Maïa n'a pas pu générer de questions sur ce PDF. Vérifie que le contenu est lisible et essaie une plage de pages plus petite.",
        },
        { status: 500 }
      );
    }

    const rows = questions.map((q) => ({
      teacher_id: user.id,
      school_id: typedCourse.school_id,
      course_id: courseId,
      subject: null,
      subject_enum: typedCourse.subject_enum ?? null,
      level: typedCourse.level ?? null,
      type: q.type,
      question: q.question,
      // mcq fields
      options: q.type === "mcq" ? (q.options ?? null) : null,
      answer_index: q.type === "mcq" ? (q.answer_index ?? null) : null,
      // numeric fields
      expected_numeric_answer: q.type === "numeric" ? (q.expected_numeric_answer ?? null) : null,
      numeric_tolerance: q.type === "numeric" ? (q.numeric_tolerance ?? 0.01) : null,
      numeric_unit: q.type === "numeric" ? (q.numeric_unit ?? null) : null,
      // short_text fields
      expected_text_answers: q.type === "short_text" ? (q.expected_text_answers ?? null) : null,
      // common
      explanation: q.explanation || null,
      period: q.period || null,
      difficulty_stars: q.difficulty ?? null,
      organization_tags: typedCourse.organization_tags ?? [],
      is_ai_generated: true,
      is_public: false,
      page_range_start: pageRange?.start ?? null,
      page_range_end: pageRange?.end ?? null,
      concept_page_hint:
        typeof q.concept_page_hint === "number" && q.concept_page_hint >= 1
          ? q.concept_page_hint
          : null,
    }));

    const { error: insertError } = await admin.from("teacher_questions").insert(rows);
    if (insertError) throw insertError;

    if (pageRange !== null) {
      await logActivity({
        event_type: "teacher_generated_targeted_questions",
        actor_id: user.id,
        actor_type: "teacher",
        target_type: "course",
        target_id: courseId,
        teacher_id: user.id,
        context: { count: rows.length, page_range: pageRange },
      });
    }

    return NextResponse.json({
      success: true,
      questionsGenerated: rows.length,
      courseId,
    });
  } catch (error) {
    console.error("[courses/generate-questions]", error);
    await logError(error, {
      source: "api.courses.generate-questions.POST",
      context: { route: "/api/courses/generate-questions" },
    });
    if (error instanceof GracefulAIError) {
      return NextResponse.json({ error: "Service temporairement sature" }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
