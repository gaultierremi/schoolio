// lib/generate-questions/run-text-pipeline.ts
//
// Pipeline A (texte) : dispatch des chapitres en workers concurrents.
// Extrait du monolithe extract-content.ts dans le cadre du PR 3 pipeline B.
//
// Responsabilité : recevoir le texte déjà extrait du PDF + les métadonnées job/course,
// identifier les chapitres, dispatcher les workers Anthropic, INSERTer snippets +
// questions chapter-by-chapter, puis mettre le job en phase "validating".
//
// Le passage à status "done" est délégué au trigger DB `trg_job_auto_done`
// (créé en PR 2) qui fire atomiquement quand text_chapters_completed === text_chapters_total
// ET (image_batches_total IS NULL OU image_batches_completed === image_batches_total).
//
// Dual-write tracking : ce module écrit dans BOTH les colonnes legacy
// (worker_count, workers_completed) ET les nouvelles colonnes PR 2
// (text_chapters_total, text_chapters_completed) pour garantir la continuité
// de l'UI pendant l'expand-contract migration. Les colonnes legacy seront
// droppées en déploiement N+2.

import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { routeAIRequest } from "@/lib/ai-router";
import { withAdminClient } from "@/lib/db/admin-client";
import { joinPagesAsMarkdown } from "@/lib/pdf/extract-text";
import { logActivity } from "@/lib/activity/log";
import { logError } from "@/lib/observability/log-error";
import { extractChapters, type Chapter } from "./extract-chapters";
import type { SchoolLevel } from "@/lib/subjects";

// ── Constants ────────────────────────────────────────────────────────────────

// Concurrence Anthropic Tier 1 sustained = 3 sans throttle observable.
export const ANTHROPIC_CONCURRENCY = 3;

// Budget interne pour les workers : laisse 60s de marge sous le maxDuration
// Trigger.dev (600s) pour les inserts finaux + status update.
export const WORKERS_DEADLINE_MS = 540_000;

// Cible questions/chapter (laissé au prompt à Sonnet, on cap entre min/max)
export const MIN_QUESTIONS_PER_CHAPTER = 5;
export const MAX_QUESTIONS_PER_CHAPTER = 25;

// ── Types ────────────────────────────────────────────────────────────────────

type QuestionType = "mcq" | "numeric" | "short_text";

type ExtractedSnippet = {
  concept_name: string;
  text: string;
  source_page: number;
};

type ExtractedQuestion = {
  type: QuestionType;
  question: string;
  concept_name?: string;
  concept_page?: number;
  options?: string[];
  answer_index?: number;
  expected_numeric_answer?: number;
  numeric_tolerance?: number;
  numeric_unit?: string;
  expected_text_answers?: string[];
  explanation: string;
  difficulty?: number;
};

export type JobRow = {
  id: string;
  course_id: string;
  teacher_id: string;
  school_id: string;
  total_target: number;
  pages_count: number | null;
  page_range_start: number | null;
  page_range_end: number | null;
};

export type CourseRow = {
  id: string;
  teacher_id: string;
  school_id: string;
  subject_enum: string | null;
  level: number | null;
  pdf_storage_path: string | null;
  organization_tags: string[] | null;
  pages_count: number | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  await withAdminClient(async (admin) => {
    await admin
      .from("question_generation_jobs")
      .update({ ...patch, phase_changed_at: new Date().toISOString() })
      .eq("id", jobId);
  });
}

export function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof e.message === "string") parts.push(e.message);
    if (typeof e.code === "string" || typeof e.code === "number") parts.push(`code=${e.code}`);
    if (typeof e.details === "string") parts.push(`details=${e.details}`);
    if (typeof e.hint === "string") parts.push(`hint=${e.hint}`);
    if (parts.length > 0) return parts.join(" ");
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}

// ── Prompts + schema ─────────────────────────────────────────────────────────

const TYPE_DISTRIBUTION: Record<string, string> = {
  mathematiques: "~50% numeric (calculs précis), ~30% mcq (concepts), ~20% short_text (définitions)",
  chimie: "~50% numeric (calculs de mole, concentration, masses), ~30% mcq, ~20% short_text (formules, noms)",
  physique: "~50% numeric (forces, énergies, vitesses), ~30% mcq, ~20% short_text",
  histoire: "~70% mcq (dates, événements), ~30% short_text (personnages, lieux)",
  geographie: "~70% mcq (pays, capitales), ~30% short_text",
  francais: "~50% short_text (définitions, completions), ~50% mcq",
  anglais: "~50% short_text (traductions, completions), ~50% mcq",
  neerlandais: "~50% short_text (traductions, completions), ~50% mcq",
  langues: "~50% short_text, ~50% mcq",
  litterature: "~50% short_text (titres, auteurs), ~50% mcq",
  biologie: "~60% mcq (processus, anatomie), ~30% short_text (noms de structures), ~10% numeric",
  sciences: "~60% mcq, ~30% short_text, ~10% numeric",
};

function getLevelHint(level: SchoolLevel | null): string {
  if (!level) return "";
  if (level <= 2) return "élèves 12-14 ans, vocabulaire de base et questions directes";
  if (level <= 4) return "élèves 14-16 ans, compréhension et applications";
  return "élèves 16-18 ans, analyse et raisonnement";
}

const CHAPTER_EXTRACTION_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    chapter_summary: { type: SchemaType.STRING },
    snippets: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          concept_name: { type: SchemaType.STRING },
          text: { type: SchemaType.STRING },
          source_page: { type: SchemaType.INTEGER },
        },
        required: ["concept_name", "text", "source_page"],
      },
    },
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING, format: "enum", enum: ["mcq", "numeric", "short_text"] },
          question: { type: SchemaType.STRING },
          concept_name: { type: SchemaType.STRING },
          concept_page: { type: SchemaType.INTEGER },
          options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          answer_index: { type: SchemaType.INTEGER },
          expected_numeric_answer: { type: SchemaType.NUMBER },
          numeric_tolerance: { type: SchemaType.NUMBER },
          numeric_unit: { type: SchemaType.STRING },
          expected_text_answers: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          explanation: { type: SchemaType.STRING },
          difficulty: { type: SchemaType.INTEGER },
        },
        required: ["type", "question", "explanation", "difficulty"],
      },
    },
  },
  required: ["chapter_summary", "snippets", "questions"],
};

function buildChapterPrompt(
  subjectLabel: string,
  level: SchoolLevel | null,
  chapter: Chapter,
  targetQuestions: number,
): string {
  const levelHint = getLevelHint(level);
  const typeDist = TYPE_DISTRIBUTION[subjectLabel.toLowerCase()] ?? "~60% mcq, ~25% short_text, ~15% numeric";
  return (
    `Tu reçois un sous-PDF contenant UN chapitre de cours de ${subjectLabel}` +
    (levelHint ? ` (${levelHint})` : "") +
    `. Chapitre : "${chapter.title}" (pages ${chapter.pageStart}-${chapter.pageEnd}).` +
    `\n\nProduis un JSON avec EXACTEMENT cette structure :` +
    ` {"chapter_summary": "...", "snippets": [...], "questions": [...]}` +
    `\n\n**chapter_summary** : 1-2 phrases résumant le chapitre.` +
    `\n\n**snippets** (5-15 éléments) : passages de THÉORIE PRINCIPALE du chapitre. Chaque snippet :` +
    ` { "concept_name": "nom court du concept (ex: 'Loi de Lavoisier')", "text": "extrait ou reformulation du PDF, 20-2000 caractères, EN MAJORITÉ extrait littéral du PDF — pas de paraphrase libre", "source_page": page absolue du PDF complet }.` +
    ` Couvre les concepts CLÉS du chapitre (définitions, formules, propositions, exemples canoniques).` +
    `\n\n**questions** (${targetQuestions} questions) : variées et pédagogiques. Distribution : ${typeDist}.` +
    ` Chaque question : { "type": "mcq|numeric|short_text", "question": "...", "concept_name": "matche un snippet", "concept_page": page du concept testé, "explanation": "...", "difficulty": 1-3, + champs type-specific }.` +
    ` Pour mcq : "options" (4 entrées) + "answer_index" (0-3).` +
    ` Pour numeric : "expected_numeric_answer" (nombre) + "numeric_tolerance" (défaut 0.01) + "numeric_unit" (optionnel).` +
    ` Pour short_text : "expected_text_answers" (tableau 1-5 réponses acceptables avec variantes).` +
    `\n\nRègles strictes : pages = numéros absolus du PDF complet, pas relatifs au sous-PDF. snippets et questions DOIVENT référencer du contenu PRÉSENT dans le PDF (pas d'hallucination). Pas de doublons entre questions.`
  );
}

// ── Parse résilient + normalize ──────────────────────────────────────────────

function parseChapterResponse(raw: string): {
  chapter_summary?: string;
  snippets?: ExtractedSnippet[];
  questions?: ExtractedQuestion[];
} {
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
  return {};
}

function normalizeSnippet(s: ExtractedSnippet, chapter: Chapter): ExtractedSnippet | null {
  if (typeof s.concept_name !== "string" || !s.concept_name.trim()) return null;
  if (typeof s.text !== "string") return null;
  const text = s.text.trim();
  // Lowered from 20 to 5 chars to accept short formulas (e.g., "H₂O", "F = ma").
  if (text.length < 5 || text.length > 4000) return null;
  // Clamp source_page to chapter range : AI may return relative pages, we want absolute.
  const rawPage = Number.isInteger(s.source_page) && s.source_page >= 1 ? s.source_page : chapter.pageStart;
  const clampedPage = rawPage >= chapter.pageStart && rawPage <= chapter.pageEnd ? rawPage : chapter.pageStart;
  return { concept_name: s.concept_name.trim(), text, source_page: clampedPage };
}

function normalizeQuestion(q: ExtractedQuestion, chapter: Chapter): ExtractedQuestion | null {
  if (typeof q.question !== "string" || !q.question.trim()) return null;
  const difficulty =
    typeof q.difficulty === "number" && Number.isInteger(q.difficulty) && q.difficulty >= 1 && q.difficulty <= 3
      ? q.difficulty
      : undefined;
  const explanation = typeof q.explanation === "string" ? q.explanation : "";
  // Clamp concept_page to chapter range : AI may return relative pages, we want absolute.
  const rawPage = typeof q.concept_page === "number" && Number.isInteger(q.concept_page) ? q.concept_page : undefined;
  const clampedPage =
    rawPage && rawPage >= chapter.pageStart && rawPage <= chapter.pageEnd ? rawPage : chapter.pageStart;
  const base = { ...q, question: q.question.trim(), explanation, difficulty, concept_page: clampedPage };

  if (q.type === "mcq") {
    const options = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
    while (options.length < 4) options.push("");
    if (!options.every(Boolean)) return null;
    const answer_index =
      Number.isInteger(q.answer_index) && q.answer_index! >= 0 && q.answer_index! <= 3 ? q.answer_index! : 0;
    return { ...base, type: "mcq", options, answer_index };
  }
  if (q.type === "numeric") {
    if (typeof q.expected_numeric_answer !== "number" || !Number.isFinite(q.expected_numeric_answer)) return null;
    const tolerance =
      typeof q.numeric_tolerance === "number" && Number.isFinite(q.numeric_tolerance) ? q.numeric_tolerance : 0.01;
    const unit = typeof q.numeric_unit === "string" && q.numeric_unit.length > 0 ? q.numeric_unit : undefined;
    return { ...base, type: "numeric", expected_numeric_answer: q.expected_numeric_answer, numeric_tolerance: tolerance, numeric_unit: unit };
  }
  if (q.type === "short_text") {
    const answers = Array.isArray(q.expected_text_answers)
      ? q.expected_text_answers.filter((a) => typeof a === "string" && a.trim().length > 0).slice(0, 5)
      : [];
    if (answers.length === 0) return null;
    return { ...base, type: "short_text", expected_text_answers: answers };
  }
  return null;
}

// ── processChapter (extract + insert immédiat) ───────────────────────────────

/**
 * Traite UN chapitre : extract sub-PDF, appel Sonnet, parse, normalize,
 * INSERT immédiatement snippets + questions en DB.
 * Returns { snippetsInserted, questionsInserted } pour le tracking.
 * Throws si tout échoue (parse impossible, AI down, etc.).
 */
async function processChapter(
  jobId: string,
  job: JobRow,
  course: CourseRow,
  pagesText: string[],
  chapter: Chapter,
  targetQuestions: number,
  subjectLabel: string,
  level: SchoolLevel | null,
): Promise<{ snippetsInserted: number; questionsInserted: number }> {
  // TEXT-ONLY : on slice les pages du chapter depuis le texte déjà extrait
  // localement (pas de PDF Vision lent). Headers "## Page N" préservent la
  // structure spatiale pour que Sonnet puisse référencer les pages correctement.
  const chapterText = joinPagesAsMarkdown(pagesText, chapter.pageStart, chapter.pageEnd);

  const prompt =
    buildChapterPrompt(subjectLabel, level, chapter, targetQuestions) +
    `\n\n--- TEXTE DU CHAPITRE ---\n\n${chapterText}`;

  const response = await routeAIRequest("extract_chapter_content", prompt, {
    requireVision: false, // text-only, gain 10x vitesse + coût
    responseSchema: CHAPTER_EXTRACTION_SCHEMA,
    maxTokens: 16384,
    cacheTtlMs: 0,
    model: "anthropic_claude", // Sonnet 4.6 pour qualité
  });

  const parsed = parseChapterResponse(response.text);

  const rawSnippets = Array.isArray(parsed.snippets) ? parsed.snippets : [];
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];

  const validSnippets = rawSnippets
    .map((s) => normalizeSnippet(s, chapter))
    .filter((s): s is ExtractedSnippet => s !== null);

  const validQuestions = rawQuestions
    .map((q) => normalizeQuestion(q, chapter))
    .filter((q): q is ExtractedQuestion => q !== null);

  if (validSnippets.length === 0 && validQuestions.length === 0) {
    throw new Error(
      `Chapter '${chapter.title}' : aucun snippet ni question valide (raw: ${rawSnippets.length}s, ${rawQuestions.length}q)`,
    );
  }

  // INSERT snippets (best-effort, on continue si fail pour ne pas perdre les questions)
  let snippetsInserted = 0;
  if (validSnippets.length > 0) {
    const snippetRows = validSnippets.map((s) => ({
      course_id: course.id,
      concept_id: null,
      school_id: course.school_id,
      text: s.text,
      source_kind: "syllabus_extraction" as const,
      source_ref: {
        chapter_title: chapter.title,
        concept_name: s.concept_name,
        source_page: s.source_page,
      },
    }));
    const { error: snipErr, count } = await withAdminClient(async (admin) => {
      return admin.from("content_snippets").insert(snippetRows, { count: "exact" });
    });
    if (snipErr) {
      await logError(new Error(`Snippet insert failed for chapter '${chapter.title}': ${snipErr.message ?? ""}`), {
        source: "run-text-pipeline.processChapter.snippets",
        context: { jobId, chapter: chapter.title, attemptedCount: validSnippets.length },
      });
    } else {
      snippetsInserted = count ?? validSnippets.length;
    }
  }

  // INSERT questions (idem best-effort)
  let questionsInserted = 0;
  if (validQuestions.length > 0) {
    const questionRows = validQuestions.map((q) => ({
      teacher_id: job.teacher_id,
      school_id: course.school_id,
      course_id: course.id,
      subject: null,
      subject_enum: course.subject_enum ?? null,
      level: course.level ?? null,
      type: q.type,
      question: q.question,
      // teacher_questions.options est NOT NULL (TEXT[]) — empty array pour
      // les questions non-mcq.
      options: q.type === "mcq" ? q.options ?? [] : [],
      answer_index: q.type === "mcq" ? q.answer_index ?? 0 : 0,
      expected_numeric_answer: q.type === "numeric" ? q.expected_numeric_answer ?? null : null,
      numeric_tolerance: q.type === "numeric" ? q.numeric_tolerance ?? 0.01 : null,
      numeric_unit: q.type === "numeric" ? q.numeric_unit ?? null : null,
      expected_text_answers: q.type === "short_text" ? q.expected_text_answers ?? null : null,
      explanation: q.explanation || null,
      period: chapter.title,
      difficulty_stars: q.difficulty ?? null,
      organization_tags: course.organization_tags ?? [],
      is_ai_generated: true,
      is_public: false,
      page_range_start: chapter.pageStart,
      page_range_end: chapter.pageEnd,
      concept_page_hint: q.concept_page ?? chapter.pageStart,
    }));
    const { error: qErr, count } = await withAdminClient(async (admin) => {
      return admin.from("teacher_questions").insert(questionRows, { count: "exact" });
    });
    if (qErr) {
      await logError(new Error(`Question insert failed for chapter '${chapter.title}': ${qErr.message ?? ""}`), {
        source: "run-text-pipeline.processChapter.questions",
        context: { jobId, chapter: chapter.title, attemptedCount: validQuestions.length },
      });
    } else {
      questionsInserted = count ?? validQuestions.length;
    }
  }

  return { snippetsInserted, questionsInserted };
}

// ── Pool de concurrence ──────────────────────────────────────────────────────

async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  async function pump(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      try {
        await worker(items[i], i);
      } catch (err) {
        // Erreurs catched DANS le worker (chaque worker fait son INSERT + log).
        // Si throw remonte ici, c'est inattendu (ex: refactor casse le try/catch
        // interne du worker). On log pour ne pas perdre silencieusement l'info.
        // eslint-disable-next-line no-console
        console.error("[runConcurrent] unexpected worker throw:", err);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, pump));
}

// ── Entry point pipeline A ───────────────────────────────────────────────────

/**
 * Pipeline A (texte) : identification des chapitres + dispatch workers Anthropic.
 *
 * Reçoit le texte extrait du PDF (déjà découpé si pageRange applicable).
 * Dispatch les chapters en pool concurrent, INSERT chapter-by-chapter.
 * Écrit dans BOTH les colonnes legacy (worker_count, workers_completed)
 * ET les nouvelles colonnes PR 2 (text_chapters_total, text_chapters_completed).
 *
 * Ne mark PAS status='done' : le trigger DB trg_job_auto_done s'en charge
 * atomiquement quand text_chapters_completed === text_chapters_total.
 * Met le job en phase='validating' après la boucle chapters.
 *
 * Throws si aucune question/snippet produit (0/0 = rien n'a marché).
 */
export async function runTextPipeline(
  jobId: string,
  job: JobRow,
  course: CourseRow,
  pagesText: string[],
  workingPagesCount: number,
  subjectLabel: string,
  level: SchoolLevel | null,
  pageRange: { start: number; end: number } | null,
): Promise<void> {
  // Phase: generating_workers (sémantique : 1 worker = 1 chapter)
  await updateJob(jobId, { phase: "generating_workers", workers_completed: 0 });

  const chapters = await extractChapters(pagesText, subjectLabel, workingPagesCount);

  if (chapters.length === 0) {
    throw new Error("Aucun chapitre identifié dans le PDF");
  }

  // Dual-write : legacy worker_count + nouveau text_chapters_total
  await updateJob(jobId, {
    worker_count: chapters.length,
    text_chapters_total: chapters.length,
    text_chapters_completed: 0,
  });

  // Réparti le quota target entre chapters proportionnellement aux pages
  const totalChapterPages = chapters.reduce((sum, c) => sum + (c.pageEnd - c.pageStart + 1), 0);
  const chapterQuotas = chapters.map((c) => {
    const pages = c.pageEnd - c.pageStart + 1;
    const proportional = Math.round((job.total_target * pages) / Math.max(totalChapterPages, 1));
    return Math.max(MIN_QUESTIONS_PER_CHAPTER, Math.min(MAX_QUESTIONS_PER_CHAPTER, proportional));
  });

  let chaptersDone = 0;
  let totalSnippetsInserted = 0;
  let totalQuestionsInserted = 0;
  const failedChapters: string[] = [];

  // Deadline interne : on stoppe gracefully avant le hard kill 600s
  const startMs = Date.now();
  const deadlineMs = startMs + WORKERS_DEADLINE_MS;

  await runConcurrent(chapters, ANTHROPIC_CONCURRENCY, async (chapter, idx) => {
    if (Date.now() > deadlineMs) {
      failedChapters.push(`${chapter.title} (skip — deadline interne atteinte)`);
      return;
    }
    try {
      const result = await processChapter(
        jobId,
        job,
        course,
        pagesText, // ← texte par page (absolu si pageRange null, sinon trimmed)
        chapter,
        chapterQuotas[idx],
        subjectLabel,
        level,
      );
      chaptersDone++;
      totalSnippetsInserted += result.snippetsInserted;
      totalQuestionsInserted += result.questionsInserted;
      // Dual-write : legacy workers_completed + nouveau text_chapters_completed
      await updateJob(jobId, {
        workers_completed: chaptersDone,
        text_chapters_completed: chaptersDone,
        questions_raw: totalQuestionsInserted,
        questions_inserted: totalQuestionsInserted,
      });
    } catch (err) {
      failedChapters.push(`${chapter.title}: ${serializeError(err).slice(0, 100)}`);
      await logError(err, {
        source: "run-text-pipeline.runTextPipeline.chapter",
        context: { jobId, chapter: chapter.title, durationMs: Date.now() - startMs },
      });
    }
  });

  // Sanity check : si aucune question ni snippet inséré, on throw pour que
  // l'orchestrateur marque le job failed.
  if (totalQuestionsInserted === 0 && totalSnippetsInserted === 0) {
    throw new Error(
      failedChapters.length === chapters.length
        ? `Tous les chapitres ont échoué : ${failedChapters.slice(0, 3).join(" | ")}`
        : "Aucune question ni snippet inséré (cause inconnue)",
    );
  }

  if (pageRange !== null) {
    await logActivity({
      event_type: "teacher_generated_targeted_questions",
      actor_id: job.teacher_id,
      actor_type: "teacher",
      target_type: "course",
      target_id: course.id,
      teacher_id: job.teacher_id,
      context: {
        questions_inserted: totalQuestionsInserted,
        snippets_inserted: totalSnippetsInserted,
        chapters_processed: chaptersDone,
        chapters_failed: failedChapters.length,
        page_range: pageRange,
      },
    });
  }

  // Phase: validating — le trigger DB trg_job_auto_done markera status='done'
  // atomiquement sur ce même UPDATE quand text_chapters_completed === text_chapters_total.
  // On écrit aussi questions_inserted final ici pour que l'UI puisse l'afficher.
  await updateJob(jobId, {
    phase: "validating",
    questions_inserted: totalQuestionsInserted,
  });
}
