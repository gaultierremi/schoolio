// Pipeline B : extract images locales -> upload Supabase Storage -> INSERT pdf_extracted_images.
// Vision Haiku classification wired in PR 5, question generation wired in PR 6.
// Toujours derriere PIPELINE_B_ENABLED feature flag (cf orchestrator).

import { extractImagesFromPdf, type ExtractedImage } from "@/lib/pdf/extract-images";
import { joinPagesAsMarkdown } from "@/lib/pdf/extract-text";
import { withAdminClient } from "@/lib/db/admin-client";
import { logError } from "@/lib/observability/log-error";
import { classifyImage } from "./vision-classify";
import { generateImageQuestion } from "./image-questions";
import { insertTeacherQuestions } from "@/lib/db/teacher-questions";
import { isSkipType } from "@/lib/pdf/image-types";

// Combien de pages de contexte autour de l'image on passe a Sonnet
// (image_page - WINDOW, image_page + WINDOW). 1 = la page de l'image + adjacentes.
const CONTEXT_PAGE_WINDOW = 1;

type JobRow = {
  id: string;
  course_id: string;
  teacher_id: string;
  school_id: string;
};

// TODO: thread subject_enum, level, organization_tags from caller (runImagePipeline args)
// for richer question metadata. For PR 6 these are stubbed to null.
type CourseRow = {
  id: string;
  teacher_id: string;
  title?: string | null;
  subject_enum?: string | null;
  level?: number | null;
  organization_tags?: string[] | null;
};

// Map d'un range de pages → period (chapter title). Construit en lisant
// les questions deja inserees par pipeline A. Permet aux questions image-aware
// d'etre regroupees sous le meme chapter que les questions texte.
type ChapterMap = Array<{ pageStart: number; pageEnd: number; period: string }>;

async function fetchChapterMap(courseId: string): Promise<ChapterMap> {
  return withAdminClient(async (admin) => {
    const { data } = await admin
      .from("teacher_questions")
      .select("period, page_range_start, page_range_end")
      .eq("course_id", courseId)
      .not("period", "is", null)
      .not("page_range_start", "is", null);
    if (!data) return [];
    const seen = new Set<string>();
    const out: ChapterMap = [];
    for (const r of data as Array<{ period: string; page_range_start: number; page_range_end: number }>) {
      const key = `${r.period}|${r.page_range_start}|${r.page_range_end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        pageStart: r.page_range_start,
        pageEnd: r.page_range_end,
        period: r.period,
      });
    }
    return out;
  });
}

function chapterFor(pageNumber: number, chapters: ChapterMap, fallback: string): string {
  const match = chapters.find((c) => pageNumber >= c.pageStart && pageNumber <= c.pageEnd);
  if (match) return match.period;
  // Si aucun match exact, on prend le premier chapter qui chevauche le plus,
  // sinon le fallback (course.title typiquement).
  if (chapters.length === 1) return chapters[0].period;
  return fallback;
}

async function updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  await withAdminClient(async (admin) => {
    await admin
      .from("question_generation_jobs")
      .update({ ...patch, phase_changed_at: new Date().toISOString() })
      .eq("id", jobId);
  });
}

async function uploadAndInsertBatch(
  jobId: string,
  job: JobRow,
  course: CourseRow,
  batch: ExtractedImage[],
  chapters: ChapterMap,
  fallbackPeriod: string,
  pagesText: string[],
): Promise<void> {
  for (const img of batch) {
    const storagePath = `${course.id}/images/${img.hash}.png`;
    await withAdminClient(async (admin) => {
      // Upload (idempotent grace au hash)
      const { error: uploadErr } = await admin.storage
        .from("course-uploads")
        .upload(storagePath, img.pngBuffer, {
          contentType: "image/png",
          upsert: true,
        });
      if (uploadErr) {
        await logError(uploadErr, {
          source: "image-pipeline.upload",
          context: { jobId, hash: img.hash, page: img.pageNumber },
        });
        return;
      }

      // INSERT audit row. Unique constraint on (course_id, hash) makes
      // it idempotent — duplicate inserts are silently swallowed.
      const { error: insertErr } = await admin.from("pdf_extracted_images").insert({
        job_id: jobId,
        course_id: course.id,
        page_number: img.pageNumber,
        storage_path: storagePath,
        hash: img.hash,
        width: img.width,
        height: img.height,
      });
      if (insertErr && !insertErr.message?.includes("duplicate")) {
        await logError(insertErr, {
          source: "image-pipeline.insert",
          context: { jobId, hash: img.hash },
        });
        return;
      }

      // Vision classification — best-effort: if it fails the row stays
      // without classification and question generation is skipped.
      const classification = await classifyImage(img.pngBuffer).catch(() => null);
      if (classification) {
        await admin
          .from("pdf_extracted_images")
          .update({
            description_md: classification.description,
            confidence: classification.confidence,
            vision_type: classification.type,
            latex_if_formula: classification.latex_if_formula,
            smiles_if_molecule: classification.smiles_if_molecule,
            topojson_region_hint: classification.topojson_region_hint,
          })
          .eq("hash", img.hash)
          .eq("course_id", course.id);

        // PR 6 : generate 1 image-aware question for non-skip types.
        if (!isSkipType(classification.type)) {
          // Public URL (bucket course-uploads est public depuis 2026-05-15) :
          // pas d'expiry contrairement aux signed URLs (qui breakaient apres 1h).
          const { data: publicData } = admin.storage
            .from("course-uploads")
            .getPublicUrl(storagePath);
          const publicUrl = publicData?.publicUrl ?? null;

          if (publicUrl) {
            // Lookup chapter par page_number depuis les questions deja inserees
            // par pipeline A. Si aucune correspondance, fallback course.title.
            const chapter = chapterFor(img.pageNumber, chapters, fallbackPeriod);

            // Vrai contexte texte du chapitre : pages ±CONTEXT_PAGE_WINDOW
            // autour de la page de l'image. Permet a Sonnet de comprendre le
            // sujet pedagogique reel (evite hallucinations "tour medievale dans
            // cours math" cf bug 2026-05-15).
            const pageStart = Math.max(1, img.pageNumber - CONTEXT_PAGE_WINDOW);
            const pageEnd = Math.min(pagesText.length, img.pageNumber + CONTEXT_PAGE_WINDOW);
            const realChapterContext = joinPagesAsMarkdown(pagesText, pageStart, pageEnd);

            const question = await generateImageQuestion({
              imageHash: img.hash,
              imageUrl: publicUrl,
              visionType: classification.type,
              description: classification.description,
              ocrText: classification.ocr_text,
              confidence: classification.confidence,
              latexIfFormula: classification.latex_if_formula,
              smilesIfMolecule: classification.smiles_if_molecule,
              topojsonRegionHint: classification.topojson_region_hint,
              pageNumber: img.pageNumber,
              chapterTitle: chapter,
              chapterContext: realChapterContext,
              job: { teacher_id: job.teacher_id, school_id: job.school_id },
              course: {
                id: course.id,
                subject_enum: course.subject_enum ?? null,
                level: course.level ?? null,
                organization_tags: course.organization_tags ?? null,
              },
            });

            if (question) {
              await insertTeacherQuestions([question]);
            }
          }
        }
      }
    });
  }
}

export async function runImagePipeline(
  jobId: string,
  job: JobRow,
  course: CourseRow,
  pdfBuffer: Buffer,
  pagesText: string[],
): Promise<{ imagesExtracted: number; imagesUploaded: number }> {
  // Wrapper top-level : si extractImagesFromPdf throw (pdfjs/canvas issue),
  // l'erreur etait avalee par Promise.allSettled dans orchestrator. On log
  // explicitement + on marque image_batches_total=0 pour ne pas bloquer le
  // trigger DB done coordinator.
  let images: ExtractedImage[];
  try {
    images = await extractImagesFromPdf(pdfBuffer);
  } catch (extractErr) {
    await logError(extractErr, {
      source: "image-pipeline.extractImagesFromPdf",
      context: { jobId, pdfBytes: pdfBuffer.byteLength },
    });
    // Marquer pipeline B comme termine avec 0 images pour debloquer le trigger
    // DB. Sinon image_batches_total reste NULL et le job ne sera jamais marque
    // done si pipeline A finit avant qu'on update.
    await updateJob(jobId, {
      image_batches_total: 0,
      image_batches_completed: 0,
    });
    return { imagesExtracted: 0, imagesUploaded: 0 };
  }

  if (images.length === 0) {
    // Mark pipeline B done immediately (image_batches_total=0 satisfies trigger)
    await updateJob(jobId, {
      image_batches_total: 0,
      image_batches_completed: 0,
    });
    return { imagesExtracted: 0, imagesUploaded: 0 };
  }

  // Batch by 5 for concurrent upload (Trigger.dev memory-friendly)
  const BATCH_SIZE = 5;
  const batches: ExtractedImage[][] = [];
  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    batches.push(images.slice(i, i + BATCH_SIZE));
  }

  await updateJob(jobId, {
    image_batches_total: batches.length,
    image_batches_completed: 0,
  });

  // Lookup une fois (en debut) le mapping page->chapter via les questions
  // deja inserees par pipeline A. Si pipeline A pas encore commence, le map
  // sera vide et on utilisera course.title comme fallback.
  const chapters = await fetchChapterMap(course.id);
  const fallbackPeriod = course.title ?? "Document complet";

  let uploaded = 0;
  let batchesDone = 0;
  for (const batch of batches) {
    await uploadAndInsertBatch(jobId, job, course, batch, chapters, fallbackPeriod, pagesText);
    uploaded += batch.length;
    batchesDone++;
    await updateJob(jobId, { image_batches_completed: batchesDone });
  }

  return { imagesExtracted: images.length, imagesUploaded: uploaded };
}
