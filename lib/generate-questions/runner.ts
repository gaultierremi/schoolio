// Cœur de la génération de questions PDF — extrait du route.ts pour être
// invocable depuis Trigger.dev (qui run en process séparé, hors Vercel).
// Le route.ts continue à valider l'input + créer le job row,
// puis trigger cette logique via tasks.trigger("generate-questions", { jobId }).
//
// Avant : route.ts → waitUntil(runGeneration()) → Vercel killait silencieusement
// le background process sur jobs longs (PDF 176p Anthropic streaming 2-4min).
// Après : route.ts → tasks.trigger() → Trigger.dev cloud run le job 1h max,
// pas de kill mid-execution, supervision propre.

import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { routeAIRequest } from "@/lib/ai-router";
import { isValidSubject, isValidLevel, SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId, SchoolLevel } from "@/lib/subjects";
import { extractPagesFromPdf } from "@/lib/pdf/extract-pages";
import { logActivity } from "@/lib/activity/log";
import { logError } from "@/lib/observability/log-error";

// ── Constants exportées (utilisées aussi par route.ts pour calculs) ──────────

export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB Gemini Vision limit
export const MAX_WORKERS = 2;
export const QUESTIONS_PER_WORKER = 50;
export const AUTO_TARGET_CAP_PER_CALL = 100;
export const MAX_QUESTIONS_PER_COURSE = 600;

export function autoTargetQuestions(pagesCount: number | null): number {
  if (!pagesCount || pagesCount < 1) return 30;
  return Math.min(AUTO_TARGET_CAP_PER_CALL, Math.ceil(pagesCount * 3));
}

export function computeWorkerLayout(target: number): {
  workerCount: number;
  questionsPerWorker: number;
} {
  const workerCount = Math.min(MAX_WORKERS, Math.max(1, Math.ceil(target / QUESTIONS_PER_WORKER)));
  const questionsPerWorker = Math.ceil(target / workerCount);
  return { workerCount, questionsPerWorker };
}

// ── Types internes ───────────────────────────────────────────────────────────

type QuestionType = "mcq" | "numeric" | "short_text";

type ExtractedQuestion = {
  type: QuestionType;
  question: string;
  options?: string[];
  answer_index?: number;
  expected_numeric_answer?: number;
  numeric_tolerance?: number;
  numeric_unit?: string;
  expected_text_answers?: string[];
  explanation: string;
  period: string;
  difficulty?: number;
  concept_page_hint?: number | null;
};

type PageRange = { start: number; end: number };

type JobRow = {
  id: string;
  course_id: string;
  teacher_id: string;
  school_id: string;
  total_target: number;
  worker_count: number;
  pages_count: number | null;
  page_range_start: number | null;
  page_range_end: number | null;
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

// ── Admin client ─────────────────────────────────────────────────────────────

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Prompts ──────────────────────────────────────────────────────────────────

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

// ── Schema pour Gemini structured output ─────────────────────────────────────

const QUESTIONS_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    page_count: { type: SchemaType.INTEGER },
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING, format: "enum", enum: ["mcq", "numeric", "short_text"] },
          question: { type: SchemaType.STRING },
          options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          answer_index: { type: SchemaType.INTEGER },
          expected_numeric_answer: { type: SchemaType.NUMBER },
          numeric_tolerance: { type: SchemaType.NUMBER },
          numeric_unit: { type: SchemaType.STRING },
          expected_text_answers: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
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

// ── Parsing & normalisation ──────────────────────────────────────────────────

function parseJsonObject<T>(rawText: string): T {
  const trimmed = rawText.trim();
  try { return JSON.parse(trimmed) as T; } catch { /* fallback below */ }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1].trim()) as T; } catch { /* fallback below */ }
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) return JSON.parse(jsonMatch[0]) as T;

  throw new Error("Reponse JSON invalide");
}

function normalizeMcqQuestion(question: ExtractedQuestion): ExtractedQuestion | null {
  const options = Array.isArray(question.options) ? question.options.slice(0, 4) : [];
  while (options.length < 4) options.push("");
  if (!options.every(Boolean)) return null;

  const answerIndex =
    Number.isInteger(question.answer_index) && question.answer_index! >= 0 && question.answer_index! <= 3
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
  if (typeof question.expected_numeric_answer !== "number" || !Number.isFinite(question.expected_numeric_answer)) {
    return null;
  }
  const tolerance =
    typeof question.numeric_tolerance === "number" && Number.isFinite(question.numeric_tolerance)
      ? question.numeric_tolerance
      : 0.01;
  const unit =
    typeof question.numeric_unit === "string" && question.numeric_unit.length > 0 ? question.numeric_unit : undefined;
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
  if (answers.length === 0) return null;
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
    typeof rawDifficulty === "number" && Number.isInteger(rawDifficulty) && rawDifficulty >= 1 && rawDifficulty <= 3
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
      if (Array.isArray((question as ExtractedQuestion).options)) {
        return normalizeMcqQuestion({ ...base, type: "mcq" });
      }
      return null;
  }
}

// ── Appel AI ─────────────────────────────────────────────────────────────────

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

// ── Helper d'update job avec phase_changed_at automatique ────────────────────

async function updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("question_generation_jobs")
    .update({ ...patch, phase_changed_at: new Date().toISOString() })
    .eq("id", jobId);
}

// ── Entry point — appelé par la task Trigger.dev ─────────────────────────────

/**
 * Exécute la génération complète pour un job déjà créé en DB.
 * Source de vérité = la row `question_generation_jobs` identifiée par jobId.
 * Met à jour `status/phase` au fur et à mesure (le client poll cette table).
 *
 * En cas d'erreur en cours d'exécution : updateJob(status='failed') + logError.
 * Ne THROW PAS — Trigger.dev marquerait le run en failed, mais on veut surtout
 * que la row jobs reflète proprement l'état pour le client.
 */
export async function runGenerationForJob(jobId: string): Promise<void> {
  const admin = createAdminClient();

  try {
    // ── Charge le job + le course associé ────────────────────────────────────
    const { data: jobRaw, error: jobErr } = await admin
      .from("question_generation_jobs")
      .select("id, course_id, teacher_id, school_id, total_target, worker_count, pages_count, page_range_start, page_range_end")
      .eq("id", jobId)
      .single();

    if (jobErr || !jobRaw) throw new Error(`Job ${jobId} introuvable: ${jobErr?.message ?? "no row"}`);
    const job = jobRaw as JobRow;

    const { data: courseRaw, error: courseErr } = await admin
      .from("courses")
      .select("id, teacher_id, school_id, subject_enum, level, pdf_storage_path, organization_tags, pages_count")
      .eq("id", job.course_id)
      .single();

    if (courseErr || !courseRaw) throw new Error(`Course ${job.course_id} introuvable`);
    const course = courseRaw as CourseRow;
    if (!course.pdf_storage_path) throw new Error("Course sans pdf_storage_path");

    const cappedQuestionsCount = job.total_target;
    const workerCount = job.worker_count;
    const questionsPerWorker = Math.ceil(cappedQuestionsCount / Math.max(workerCount, 1));
    let pageRange: PageRange | null =
      typeof job.page_range_start === "number" && typeof job.page_range_end === "number"
        ? { start: job.page_range_start, end: job.page_range_end }
        : null;

    // ── PHASE: extracting_pdf ────────────────────────────────────────────────
    await updateJob(jobId, { status: "running", phase: "extracting_pdf" });

    const { data: pdfBlob, error: downloadError } = await admin.storage
      .from("course-pdfs")
      .download(course.pdf_storage_path);

    if (downloadError || !pdfBlob) {
      throw new Error(`PDF download failed: ${downloadError?.message ?? "no blob"}`);
    }

    const fullPdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
    if (fullPdfBuffer.byteLength > MAX_PDF_BYTES) {
      const sizeMB = (fullPdfBuffer.byteLength / 1024 / 1024).toFixed(1);
      throw new Error(`PDF de ${sizeMB}MB trop volumineux (max 20MB)`);
    }

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
        console.warn("[runner] Extraction pages echouee, fallback PDF entier:", err);
        pageRange = null;
      }
    }

    const pdfBase64 = pdfBuffer.toString("base64");

    const subject: SubjectId = isValidSubject(course.subject_enum) ? course.subject_enum : "histoire";
    const level: SchoolLevel | null = isValidLevel(course.level) ? course.level : null;
    const systemPrompt = buildSystemPrompt(subject, level);
    const pageRangePromptSuffix = pageRange !== null
      ? ` Le contenu fourni correspond aux pages ${pageRange.start} a ${pageRange.end} du document original.`
      : "";
    const promptWithRange = systemPrompt + pageRangePromptSuffix;

    // ── PHASE: generating_workers (parallel Anthropic streaming) ─────────────
    await updateJob(jobId, { phase: "generating_workers", workers_completed: 0 });

    let workersDone = 0;
    const settled = await Promise.allSettled(
      Array.from({ length: workerCount }, async (_, workerIndex) => {
        const wt0 = Date.now();
        try {
          const output = await generateQuestionsWithFallback(
            pdfBase64,
            promptWithRange,
            workerIndex,
            workerCount,
            questionsPerWorker,
          );
          workersDone++;
          await updateJob(jobId, { workers_completed: workersDone });
          return output;
        } catch (err) {
          await logError(err, {
            source: "generate-questions.runner.worker",
            context: {
              jobId,
              workerIndex,
              workerCount,
              questionsPerWorker,
              durationMs: Date.now() - wt0,
              pdfSizeBytes: pdfBuffer.byteLength,
            },
          });
          throw err;
        }
      }),
    );

    const workerOutputs: string[] = [];
    const workerErrors: string[] = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") workerOutputs.push(r.value);
      else workerErrors.push(`worker ${i}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    });

    if (workerOutputs.length === 0) {
      throw new Error(`Tous les workers ont échoué (${workerCount}) : ${workerErrors.slice(0, 2).join(" | ")}`);
    }

    const parsedOutputs = workerOutputs.map((rawText) =>
      parseJsonObject<{ questions: ExtractedQuestion[]; page_count?: number }>(rawText)
    );
    const rawQuestions = parsedOutputs.flatMap((output) =>
      Array.isArray(output.questions) ? output.questions : []
    );

    // ── PHASE: validating ────────────────────────────────────────────────────
    await updateJob(jobId, { phase: "validating", questions_raw: rawQuestions.length });

    const normalized = rawQuestions.map(normalizeQuestion);
    const questions = normalized
      .filter((q): q is ExtractedQuestion => q !== null)
      .slice(0, cappedQuestionsCount);

    if (questions.length === 0) {
      await logError(new Error("runner: 0 questions after normalize"), {
        source: "generate-questions.runner",
        context: {
          jobId,
          courseId: course.id,
          subject,
          level,
          pageRange,
          rawCount: rawQuestions.length,
          pdfSizeBytes: fullPdfBuffer.byteLength,
        },
        userId: job.teacher_id,
      });
      throw new Error(rawQuestions.length > 0
        ? "Aucune question valide générée (toutes filtrées)"
        : "Maïa n'a pas pu générer de questions sur ce PDF");
    }

    // ── PHASE: inserting_db ──────────────────────────────────────────────────
    await updateJob(jobId, { phase: "inserting_db" });

    const rows = questions.map((q) => ({
      teacher_id: job.teacher_id,
      school_id: course.school_id,
      course_id: course.id,
      subject: null,
      subject_enum: course.subject_enum ?? null,
      level: course.level ?? null,
      type: q.type,
      question: q.question,
      options: q.type === "mcq" ? (q.options ?? null) : null,
      answer_index: q.type === "mcq" ? (q.answer_index ?? null) : null,
      expected_numeric_answer: q.type === "numeric" ? (q.expected_numeric_answer ?? null) : null,
      numeric_tolerance: q.type === "numeric" ? (q.numeric_tolerance ?? 0.01) : null,
      numeric_unit: q.type === "numeric" ? (q.numeric_unit ?? null) : null,
      expected_text_answers: q.type === "short_text" ? (q.expected_text_answers ?? null) : null,
      explanation: q.explanation || null,
      period: q.period || null,
      difficulty_stars: q.difficulty ?? null,
      organization_tags: course.organization_tags ?? [],
      is_ai_generated: true,
      is_public: false,
      page_range_start: pageRange?.start ?? null,
      page_range_end: pageRange?.end ?? null,
      concept_page_hint: typeof q.concept_page_hint === "number" && q.concept_page_hint >= 1
        ? q.concept_page_hint
        : null,
    }));

    const { error: insertError } = await admin.from("teacher_questions").insert(rows);
    if (insertError) throw insertError;

    if (pageRange !== null) {
      await logActivity({
        event_type: "teacher_generated_targeted_questions",
        actor_id: job.teacher_id,
        actor_type: "teacher",
        target_type: "course",
        target_id: course.id,
        teacher_id: job.teacher_id,
        context: { count: rows.length, page_range: pageRange },
      });
    }

    // ── PHASE: done ──────────────────────────────────────────────────────────
    await updateJob(jobId, {
      status: "done",
      phase: "done",
      questions_inserted: rows.length,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    await logError(err, { source: "generate-questions.runner", context: { jobId } });
    await updateJob(jobId, {
      status: "failed",
      phase: "failed",
      error_message: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
      completed_at: new Date().toISOString(),
    });
  }
}
