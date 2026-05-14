// Génération de questions à partir d'un PDF de cours — VERSION REFACTOR.
//
// Pipeline structure-first :
//   1. extract chapters (TOC) via 1 appel Anthropic pre-pass
//   2. pour chaque chapitre : extract pages + 1 appel Anthropic ciblé
//   3. insert avec period = chapter.title (filtre niveau 2 propre)
//
// Avant : on découpait le PDF en tranches AVEUGLES (pages 1-44, 45-88…) et
// demandait 50 questions/worker → JSON tronqué, period bricolé, overlap.
// Maintenant : on lit la structure d'abord, génère par chapitre cohérent.

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

// ── Constants exportées (utilisées aussi par route.ts pour validation) ──────

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_QUESTIONS_PER_COURSE = 600;

// Concurrence des appels Anthropic en simultané. Free tier accepte 3-4
// streaming concurrent sans throttle visible. 3 = sweet spot.
const ANTHROPIC_CONCURRENCY = 3;

// Cible de questions par chapitre (10-15 = sweet spot : output JSON ~5KB,
// pas de risque tronquature à max_tokens=8192). Le total cible est divisé
// proportionnellement entre les chapitres selon leur nombre de pages.
const MIN_QUESTIONS_PER_CHAPTER = 5;
const MAX_QUESTIONS_PER_CHAPTER = 30;

/**
 * Cible automatique de questions selon le nombre de pages du PDF.
 * ~3 questions par page, plafonnée à 300 par appel pour rester raisonnable.
 */
export function autoTargetQuestions(pagesCount: number | null): number {
  if (!pagesCount || pagesCount < 1) return 30;
  return Math.min(300, Math.ceil(pagesCount * 3));
}

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Supabase admin ──────────────────────────────────────────────────────────

function createAdminClient() {
  // Polyfill `ws` requis sur Trigger.dev cloud (Node 21, pas de WS natif).
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

// ── Prompts ─────────────────────────────────────────────────────────────────

const TYPE_DISTRIBUTION: Record<string, string> = {
  mathematiques: "~50% numeric, ~30% mcq, ~20% short_text",
  chimie: "~50% numeric, ~30% mcq, ~20% short_text",
  physique: "~50% numeric, ~30% mcq, ~20% short_text",
  histoire: "~70% mcq, ~30% short_text",
  geographie: "~70% mcq, ~30% short_text",
  francais: "~50% mcq, ~50% short_text",
  anglais: "~50% mcq, ~50% short_text",
  neerlandais: "~50% mcq, ~50% short_text",
  langues: "~50% mcq, ~50% short_text",
  litterature: "~50% mcq, ~50% short_text",
  biologie: "~60% mcq, ~30% short_text, ~10% numeric",
  sciences: "~60% mcq, ~30% short_text, ~10% numeric",
};

function getLevelHint(level: SchoolLevel | null): string {
  if (!level) return "";
  if (level <= 2) return "élèves 12-14 ans, vocabulaire de base et questions directes";
  if (level <= 4) return "élèves 14-16 ans, compréhension et applications";
  return "élèves 16-18 ans, analyse et raisonnement";
}

const CHAPTER_QUESTIONS_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
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
          difficulty: { type: SchemaType.INTEGER },
        },
        required: ["type", "question", "explanation", "difficulty"],
      },
    },
  },
  required: ["questions"],
};

function buildChapterPrompt(
  subjectLabel: string,
  level: SchoolLevel | null,
  chapter: Chapter,
  questionCount: number,
): string {
  const levelHint = getLevelHint(level);
  const typeDist = TYPE_DISTRIBUTION[subjectLabel.toLowerCase()] ?? "~60% mcq, ~25% short_text, ~15% numeric";
  return (
    `Tu reçois un sous-PDF contenant UN chapitre de cours de ${subjectLabel}` +
    (levelHint ? ` (${levelHint})` : "") +
    `. Chapitre : "${chapter.title}".` +
    ` Génère ${questionCount} questions de quiz pertinentes sur ce chapitre.` +
    ` Réponds UNIQUEMENT en JSON valide : {"questions": [...]}.` +
    ` Trois types de questions :` +
    ` 1) mcq : {"type":"mcq","question":"...","options":["A","B","C","D"],"answer_index":0,"explanation":"...","difficulty":2}` +
    ` 2) numeric : {"type":"numeric","question":"...","expected_numeric_answer":42.5,"numeric_tolerance":0.5,"numeric_unit":"m/s","explanation":"...","difficulty":2}` +
    ` 3) short_text : {"type":"short_text","question":"...","expected_text_answers":["reponse1","reponse2"],"explanation":"...","difficulty":2}` +
    ` Règles : mcq = exactement 4 options, answer_index 0-3.` +
    ` numeric : expected_numeric_answer obligatoire (nombre), tolerance optionnel (défaut 0.01), unit optionnel.` +
    ` short_text : expected_text_answers = tableau 1-5 réponses acceptables (variantes orthographiques/synonymes).` +
    ` difficulty = 1, 2 ou 3.` +
    ` Distribution : ${typeDist}.` +
    ` Questions claires, pédagogiques, directement liées au contenu du chapitre.`
  );
}

// ── Normalisation des questions ─────────────────────────────────────────────

function normalizeQuestion(q: ExtractedQuestion): ExtractedQuestion | null {
  if (typeof q.question !== "string" || !q.question.trim()) return null;

  const difficulty =
    typeof q.difficulty === "number" && Number.isInteger(q.difficulty) && q.difficulty >= 1 && q.difficulty <= 3
      ? q.difficulty
      : undefined;
  const explanation = typeof q.explanation === "string" ? q.explanation : "";
  const base = { ...q, question: q.question.trim(), explanation, difficulty };

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

// ── Génération d'1 chapitre (1 appel Anthropic ciblé) ───────────────────────

async function generateForChapter(
  fullPdfBuffer: Buffer,
  chapter: Chapter,
  questionCount: number,
  subjectLabel: string,
  level: SchoolLevel | null,
): Promise<ExtractedQuestion[]> {
  // Extract le sub-PDF de ce chapitre (rapide, in-process)
  const subBuffer = await extractPagesFromPdf({
    pdfBuffer: fullPdfBuffer,
    startPage: chapter.pageStart,
    endPage: chapter.pageEnd,
  });
  const subBase64 = Buffer.from(subBuffer).toString("base64");

  const prompt = buildChapterPrompt(subjectLabel, level, chapter, questionCount);

  const response = await routeAIRequest("generate_questions", prompt, {
    pdfBase64: subBase64,
    requireVision: true,
    responseSchema: CHAPTER_QUESTIONS_SCHEMA,
    maxTokens: 8192, // ~30 questions max, marge confortable
    cacheTtlMs: 0,
  });

  const parsed = parseQuestionsResponse(response.text);
  return Array.isArray(parsed.questions) ? parsed.questions : [];
}

/**
 * Parse résilient de la réponse questions (idem extract-chapters).
 * Anthropic/Gemini peut wrap en markdown fences ou préfixer avec du prose.
 */
function parseQuestionsResponse(raw: string): { questions?: ExtractedQuestion[] } {
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
  return { questions: [] };
}

// ── Pool d'exécution concurrence-limitée ────────────────────────────────────

async function runConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void | Promise<void>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const results = new Array<{ ok: true; value: R } | { ok: false; error: unknown }>(items.length);
  let nextIndex = 0;
  let doneCount = 0;

  async function pump(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      try {
        const value = await worker(items[i], i);
        results[i] = { ok: true, value };
      } catch (error) {
        results[i] = { ok: false, error };
      }
      doneCount++;
      if (onProgress) await onProgress(doneCount, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, pump));
  return results;
}

// ── Serialize n'importe quel error type vers une string lisible ─────────────

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

// ── Entry point — appelé par la task Trigger.dev ────────────────────────────

/**
 * Exécute la génération complète pour un job déjà créé en DB.
 * Source de vérité = la row `question_generation_jobs` identifiée par jobId.
 * Met à jour `status/phase` au fur et à mesure (le client poll cette table).
 *
 * En cas d'erreur en cours d'exécution : updateJob(status='failed') + logError.
 * Ne THROW jamais — la task Trigger.dev doit return cleanly pour que le statut
 * DB soit le seul source of truth côté UI.
 */
export async function runGenerationForJob(jobId: string): Promise<void> {
  const admin = createAdminClient();

  try {
    // ── Charge job + course ─────────────────────────────────────────────────
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

    // ── PHASE: extracting_pdf ───────────────────────────────────────────────
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

    // Si page_range fourni par le prof, on travaille sur ce sous-PDF dès maintenant.
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
        console.warn("[runner] page_range extract failed, fallback PDF entier:", err);
      }
    }

    // ── PHASE: generating_workers (semantique : phase 1 = TOC, phase 2 = chapters) ──
    // On réutilise la phase existante 'generating_workers' pour ne pas casser
    // le UI client poll. La sémantique change : un "worker" = un chapitre.
    await updateJob(jobId, { phase: "generating_workers", workers_completed: 0 });

    const workingBase64 = workingBuffer.toString("base64");
    const chapters = await extractChapters(workingBase64, subjectLabel, workingPagesCount);

    if (chapters.length === 0) {
      throw new Error("Aucun chapitre identifié dans le PDF");
    }

    // Update le job avec le nombre réel de chapitres (= workers logiques)
    await updateJob(jobId, { worker_count: chapters.length });

    // Réparti le quota total entre chapitres proportionnellement à leurs pages.
    const totalChapterPages = chapters.reduce((sum, c) => sum + (c.pageEnd - c.pageStart + 1), 0);
    const target = job.total_target;
    const chapterQuotas = chapters.map((c) => {
      const pages = c.pageEnd - c.pageStart + 1;
      const proportional = Math.round((target * pages) / Math.max(totalChapterPages, 1));
      return Math.max(MIN_QUESTIONS_PER_CHAPTER, Math.min(MAX_QUESTIONS_PER_CHAPTER, proportional));
    });

    // ── Lancement parallèle (concurrence 3) ─────────────────────────────────
    const results = await runConcurrent(
      chapters,
      ANTHROPIC_CONCURRENCY,
      async (chapter, idx) => {
        return generateForChapter(workingBuffer, chapter, chapterQuotas[idx], subjectLabel, level);
      },
      async (done, total) => {
        await updateJob(jobId, { workers_completed: done });
      },
    );

    // ── PHASE: validating + collect ─────────────────────────────────────────
    const rawQuestions: Array<{ q: ExtractedQuestion; chapterTitle: string; chapterPageStart: number }> = [];
    let chapterFailures = 0;
    results.forEach((r, idx) => {
      const chapter = chapters[idx];
      if (!r.ok) {
        chapterFailures++;
        logError(r.error, {
          source: "generate-questions.runner.chapter",
          context: { jobId, chapter, message: serializeError(r.error) },
        }).catch(() => undefined);
        return;
      }
      for (const q of r.value) {
        rawQuestions.push({ q, chapterTitle: chapter.title, chapterPageStart: chapter.pageStart });
      }
    });

    await updateJob(jobId, { phase: "validating", questions_raw: rawQuestions.length });

    const validRows = rawQuestions
      .map((item) => {
        const normalized = normalizeQuestion(item.q);
        if (!normalized) return null;
        return { normalized, chapterTitle: item.chapterTitle, chapterPageStart: item.chapterPageStart };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, Math.min(target, MAX_QUESTIONS_PER_COURSE));

    if (validRows.length === 0) {
      throw new Error(
        chapterFailures > 0
          ? `Aucune question générée (${chapterFailures}/${chapters.length} chapitres ont échoué)`
          : "Maïa n'a pas pu générer de questions sur ce PDF"
      );
    }

    // ── PHASE: inserting_db ─────────────────────────────────────────────────
    await updateJob(jobId, { phase: "inserting_db" });

    const rows = validRows.map(({ normalized: q, chapterTitle, chapterPageStart }) => ({
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
      period: chapterTitle, // ← Filtre niveau 2 propre, vient directement de la TOC
      difficulty_stars: q.difficulty ?? null,
      organization_tags: course.organization_tags ?? [],
      is_ai_generated: true,
      is_public: false,
      page_range_start: pageRange?.start ?? null,
      page_range_end: pageRange?.end ?? null,
      concept_page_hint: chapterPageStart, // ← Pointe vers la première page du chapitre
    }));

    const { error: insertError } = await admin.from("teacher_questions").insert(rows);
    if (insertError) {
      throw new Error(
        `Insert teacher_questions failed: ${insertError.message ?? ""}` +
          (insertError.code ? ` (code=${insertError.code})` : "") +
          (insertError.details ? ` details=${insertError.details}` : "")
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
        context: { count: rows.length, page_range: pageRange, chapters: chapters.length },
      });
    }

    // ── PHASE: done ─────────────────────────────────────────────────────────
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
      error_message: serializeError(err).slice(0, 500),
      completed_at: new Date().toISOString(),
    });
  }
}
