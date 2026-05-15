// lib/generate-questions/orchestrator.ts
//
// Orchestrateur léger : load job + course, extract texte PDF une fois,
// dispatch pipelines A (texte, existant) et B (images, futur) en parallèle.
// Le trigger DB trg_job_auto_done marque le job done atomiquement quand
// les 2 pipelines ont terminé.
//
// Pipeline B est derrière PIPELINE_B_ENABLED (feature flag env var).
// En PR 4 : pipeline B (runImagePipeline) branché derrière PIPELINE_B_ENABLED.

import { logError } from "@/lib/observability/log-error";
import { withAdminClient } from "@/lib/db/admin-client";
import { extractTextFromPdf } from "@/lib/pdf/extract-text";
import { isValidSubject, isValidLevel, SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId, SchoolLevel } from "@/lib/subjects";
import { PIPELINE_B_ENABLED } from "@/lib/feature-flags";
import { runTextPipeline } from "./run-text-pipeline";
import { runImagePipeline } from "./run-image-pipeline";
import { MAX_PDF_BYTES } from "./extract-content";
import type { JobRow, CourseRow } from "./run-text-pipeline";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  await withAdminClient(async (admin) => {
    await admin
      .from("question_generation_jobs")
      .update({ ...patch, phase_changed_at: new Date().toISOString() })
      .eq("id", jobId);
  });
}

function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Orchestrateur principal de la génération de questions.
 *
 * Responsabilités :
 * 1. Load job + course depuis la DB en une seule scope admin.
 * 2. Download PDF depuis Supabase Storage + vérifier la taille.
 * 3. Extraire le texte localement avec pdfjs-dist (~1s pour 176 pages).
 * 4. Appliquer le pageRange si applicable (slice de pagesText).
 * 5. Dispatcher pipeline A (runTextPipeline) + futures pipelines en parallèle.
 *
 * Ne marque PAS status='done' : le trigger DB trg_job_auto_done s'en charge
 * atomiquement quand text_chapters_completed === text_chapters_total AND
 * (image_batches_total IS NULL OR image_batches_completed === image_batches_total).
 *
 * Ne throw jamais : les erreurs sont catchées, loguées, et le job est marqué failed.
 */
export async function runOrchestrator(jobId: string): Promise<void> {
  try {
    // Load job + course dans une seule scope admin pour réduire les round-trips
    const { jobRaw, jobErr, courseRaw, courseErr } = await withAdminClient(async (admin) => {
      const { data: jobRaw, error: jobErr } = await admin
        .from("question_generation_jobs")
        .select("id, course_id, teacher_id, school_id, total_target, pages_count, page_range_start, page_range_end")
        .eq("id", jobId)
        .single();
      if (jobErr || !jobRaw) return { jobRaw, jobErr, courseRaw: null, courseErr: null };

      const { data: courseRaw, error: courseErr } = await admin
        .from("courses")
        .select("id, teacher_id, school_id, subject_enum, level, pdf_storage_path, organization_tags, pages_count")
        .eq("id", (jobRaw as JobRow).course_id)
        .single();
      return { jobRaw, jobErr, courseRaw, courseErr };
    });

    if (jobErr || !jobRaw) throw new Error(`Job ${jobId} introuvable: ${jobErr?.message ?? "no row"}`);
    if (courseErr || !courseRaw) throw new Error(`Course introuvable: ${courseErr?.message ?? "no row"}`);

    const job = jobRaw as JobRow;
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

    const pdfBuffer = await withAdminClient(async (admin) => {
      const { data: pdfBlob, error: downloadError } = await admin.storage
        .from("course-pdfs")
        .download(course.pdf_storage_path!);
      if (downloadError || !pdfBlob) {
        throw new Error(`PDF download failed: ${downloadError?.message ?? "no blob"}`);
      }
      return Buffer.from(await pdfBlob.arrayBuffer());
    });

    if (pdfBuffer.byteLength > MAX_PDF_BYTES) {
      const sizeMB = (pdfBuffer.byteLength / 1024 / 1024).toFixed(1);
      throw new Error(`PDF de ${sizeMB}MB trop volumineux (max 20MB)`);
    }

    const extracted = await extractTextFromPdf(pdfBuffer);
    // eslint-disable-next-line no-console
    console.log(
      `[orchestrator] text extraction: ${extracted.pageCount} pages, ${extracted.totalChars} chars, ${extracted.durationMs}ms`,
    );

    let pagesText = extracted.pagesText;
    let workingPagesCount = extracted.pageCount;
    if (pageRange !== null) {
      const start = Math.max(1, pageRange.start);
      const end = Math.min(extracted.pageCount, pageRange.end);
      pagesText = extracted.pagesText.slice(start - 1, end);
      workingPagesCount = end - start + 1;
    }

    // Dispatch pipelines en parallèle.
    // Pipeline B (images) tourne derrière PIPELINE_B_ENABLED. Vision en PR 5.
    // DIAGNOSTIC : log la valeur reelle de PIPELINE_B_ENABLED + env var brute
    // pour distinguer "var non injectee" vs "code path non emprunte".
    await logError(
      new Error(
        `[diag] PIPELINE_B_ENABLED constant=${PIPELINE_B_ENABLED} env=${process.env.PIPELINE_B_ENABLED ?? "undefined"}`,
      ),
      {
        source: "orchestrator.diagnostic",
        severity: "info",
        context: { jobId, pipelineBEnabledConst: PIPELINE_B_ENABLED, envVarRaw: process.env.PIPELINE_B_ENABLED ?? null },
      },
    );

    const promises: Promise<unknown>[] = [
      runTextPipeline(jobId, job, course, pagesText, workingPagesCount, subjectLabel, level, pageRange),
    ];

    if (PIPELINE_B_ENABLED) {
      promises.push(runImagePipeline(jobId, job, course, pdfBuffer));
    }

    await Promise.allSettled(promises);

    // Note: status='done' est positionné atomiquement par le trigger DB trg_job_auto_done
    // quand text_chapters_completed === text_chapters_total AND
    // (image_batches_total IS NULL OR image_batches_completed === image_batches_total).
    // Pas d'updateJob({status:'done'}) ici.
  } catch (err) {
    await logError(err, { source: "orchestrator.runOrchestrator", context: { jobId } });
    await updateJob(jobId, {
      status: "failed",
      phase: "failed",
      error_message: serializeError(err).slice(0, 500),
      completed_at: new Date().toISOString(),
    });
  }
}
