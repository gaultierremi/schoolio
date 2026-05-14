// lib/generate-questions/extract-content.ts
//
// Pipeline d'extraction structurée d'un syllabus PDF.
// Cf design spec : docs/superpowers/specs/2026-05-14-pdf-extraction-design.md
//
// Flow :
//   1. TOC extraction (Haiku 4.5 via extract-chapters.ts) → chapters[]
//   2. Pool de 3 workers Sonnet 4.6 traitent chapter-by-chapter
//   3. Chaque worker INSERT immédiatement ses snippets + questions
//   4. Update workers_completed après chaque insert (partial success)

import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { routeAIRequest } from "@/lib/ai-router";
import { isValidSubject, isValidLevel, SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId, SchoolLevel } from "@/lib/subjects";
import { extractPagesFromPdf } from "@/lib/pdf/extract-pages";
import { logActivity } from "@/lib/activity/log";
import { logError } from "@/lib/observability/log-error";
import { extractChapters, type Chapter } from "./extract-chapters";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_QUESTIONS_PER_COURSE = 600;

// Concurrence Anthropic Tier 1 sustained = 3 sans throttle observable.
const ANTHROPIC_CONCURRENCY = 3;

// Budget interne pour les workers : laisse 60s de marge sous le maxDuration
// Trigger.dev (600s) pour les inserts finaux + status update.
const WORKERS_DEADLINE_MS = 540_000;

// Cible questions/chapter (laissé au prompt à Sonnet, on cap entre min/max)
const MIN_QUESTIONS_PER_CHAPTER = 5;
const MAX_QUESTIONS_PER_CHAPTER = 25;

export function autoTargetQuestions(pagesCount: number | null): number {
  if (!pagesCount || pagesCount < 1) return 30;
  return Math.min(300, Math.ceil(pagesCount * 3));
}

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

type JobRow = {
  id: string;
  course_id: string;
  teacher_id: string;
  school_id: string;
  total_target: number;
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

// ── Supabase admin + helpers ────────────────────────────────────────────────

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      realtime: { transport: WebSocket as any },
    },
  );
}

async function updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("question_generation_jobs")
    .update({ ...patch, phase_changed_at: new Date().toISOString() })
    .eq("id", jobId);
}

function serializeError(err: unknown): string {
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

// ── Prompts + schema ────────────────────────────────────────────────────────

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

// ── Parse résilient + normalize ─────────────────────────────────────────────

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

// ── processChapter (extract + insert immédiat) ──────────────────────────────

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
  fullPdfBuffer: Buffer,
  chapter: Chapter,
  targetQuestions: number,
  subjectLabel: string,
  level: SchoolLevel | null,
): Promise<{ snippetsInserted: number; questionsInserted: number }> {
  const subBuffer = await extractPagesFromPdf({
    pdfBuffer: fullPdfBuffer,
    startPage: chapter.pageStart,
    endPage: chapter.pageEnd,
  });
  const subBase64 = Buffer.from(subBuffer).toString("base64");

  const prompt = buildChapterPrompt(subjectLabel, level, chapter, targetQuestions);

  const response = await routeAIRequest("extract_chapter_content", prompt, {
    pdfBase64: subBase64,
    requireVision: true,
    responseSchema: CHAPTER_EXTRACTION_SCHEMA,
    maxTokens: 16384, // 15 snippets + 15 questions ~ 12-15K tokens, marge
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

  const admin = createAdminClient();

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
    const { error: snipErr, count } = await admin
      .from("content_snippets")
      .insert(snippetRows, { count: "exact" });
    if (snipErr) {
      await logError(new Error(`Snippet insert failed for chapter '${chapter.title}': ${snipErr.message ?? ""}`), {
        source: "extract-content.processChapter.snippets",
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
      options: q.type === "mcq" ? q.options ?? null : null,
      answer_index: q.type === "mcq" ? q.answer_index ?? null : null,
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
    const { error: qErr, count } = await admin
      .from("teacher_questions")
      .insert(questionRows, { count: "exact" });
    if (qErr) {
      await logError(new Error(`Question insert failed for chapter '${chapter.title}': ${qErr.message ?? ""}`), {
        source: "extract-content.processChapter.questions",
        context: { jobId, chapter: chapter.title, attemptedCount: validQuestions.length },
      });
    } else {
      questionsInserted = count ?? validQuestions.length;
    }
  }

  return { snippetsInserted, questionsInserted };
}

// ── Pool de concurrence ─────────────────────────────────────────────────────

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

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Exécute la pipeline d'extraction pour un job déjà créé en DB.
 * Source de vérité = la row `question_generation_jobs` identifiée par jobId.
 * Met à jour `status/phase` au fur et à mesure.
 * INSERT chapter-by-chapter : partial success préservé en cas de timeout.
 * Ne THROW jamais — le statut DB est le seul source of truth côté UI.
 */
export async function runExtractionForJob(jobId: string): Promise<void> {
  const admin = createAdminClient();

  try {
    // Load job + course
    const { data: jobRaw, error: jobErr } = await admin
      .from("question_generation_jobs")
      .select("id, course_id, teacher_id, school_id, total_target, pages_count, page_range_start, page_range_end")
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

    const subject: SubjectId = isValidSubject(course.subject_enum) ? course.subject_enum : "histoire";
    const level: SchoolLevel | null = isValidLevel(course.level) ? course.level : null;
    const subjectLabel = SUBJECTS_BY_ID[subject].label;
    const pageRange =
      typeof job.page_range_start === "number" && typeof job.page_range_end === "number"
        ? { start: job.page_range_start, end: job.page_range_end }
        : null;

    // Phase: extracting_pdf
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

    let workingBuffer: Buffer = fullPdfBuffer;
    let workingPagesCount = course.pages_count ?? null;
    if (pageRange !== null) {
      try {
        const extracted = await extractPagesFromPdf({
          pdfBuffer: fullPdfBuffer,
          startPage: pageRange.start,
          endPage: pageRange.end,
        });
        workingBuffer = Buffer.from(extracted);
        workingPagesCount = pageRange.end - pageRange.start + 1;
      } catch (err) {
        console.warn("[extract-content] page_range extract failed, fallback PDF entier:", err);
      }
    }

    // Phase: generating_workers (sémantique : 1 worker = 1 chapter)
    await updateJob(jobId, { phase: "generating_workers", workers_completed: 0 });

    const workingBase64 = workingBuffer.toString("base64");
    const chapters = await extractChapters(workingBase64, subjectLabel, workingPagesCount);

    if (chapters.length === 0) {
      throw new Error("Aucun chapitre identifié dans le PDF");
    }

    await updateJob(jobId, { worker_count: chapters.length });

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
          fullPdfBuffer, // ← fullPdfBuffer car les chapter ranges sont absolues
          chapter,
          chapterQuotas[idx],
          subjectLabel,
          level,
        );
        chaptersDone++;
        totalSnippetsInserted += result.snippetsInserted;
        totalQuestionsInserted += result.questionsInserted;
        await updateJob(jobId, {
          workers_completed: chaptersDone,
          questions_raw: totalQuestionsInserted,
          questions_inserted: totalQuestionsInserted,
        });
      } catch (err) {
        failedChapters.push(`${chapter.title}: ${serializeError(err).slice(0, 100)}`);
        await logError(err, {
          source: "extract-content.runExtractionForJob.chapter",
          context: { jobId, chapter: chapter.title, durationMs: Date.now() - startMs },
        });
      }
    });

    // Phase: validating (sanity)
    await updateJob(jobId, { phase: "validating" });

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

    // Phase: done
    await updateJob(jobId, {
      status: "done",
      phase: "done",
      questions_inserted: totalQuestionsInserted,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    await logError(err, { source: "extract-content.runExtractionForJob", context: { jobId } });
    await updateJob(jobId, {
      status: "failed",
      phase: "failed",
      error_message: serializeError(err).slice(0, 500),
      completed_at: new Date().toISOString(),
    });
  }
}
