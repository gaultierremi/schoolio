// Pipeline B : extract images locales -> upload Supabase Storage -> INSERT pdf_extracted_images.
// Vision Haiku classification wired in PR 5, question generation wired in PR 6.
// Toujours derriere PIPELINE_B_ENABLED feature flag (cf orchestrator).

import { extractImagesFromPdf, type ExtractedImage } from "@/lib/pdf/extract-images";
import { withAdminClient } from "@/lib/db/admin-client";
import { logError } from "@/lib/observability/log-error";
import { classifyImage } from "./vision-classify";
import { generateImageQuestion } from "./image-questions";
import { insertTeacherQuestions } from "@/lib/db/teacher-questions";
import { isSkipType } from "@/lib/pdf/image-types";

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
  subject_enum?: string | null;
  level?: number | null;
  organization_tags?: string[] | null;
};

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
          // Get a signed URL for the image (1h expiry) so question can reference it.
          const { data: signedData } = await admin.storage
            .from("course-uploads")
            .createSignedUrl(storagePath, 3600);
          const signedUrl = signedData?.signedUrl ?? null;

          if (signedUrl) {
            const question = await generateImageQuestion({
              imageHash: img.hash,
              imageUrl: signedUrl,
              visionType: classification.type,
              description: classification.description,
              ocrText: classification.ocr_text,
              confidence: classification.confidence,
              latexIfFormula: classification.latex_if_formula,
              smilesIfMolecule: classification.smiles_if_molecule,
              topojsonRegionHint: classification.topojson_region_hint,
              pageNumber: img.pageNumber,
              // TODO: match actual chapter from text pipeline TOC (future enhancement)
              chapterTitle: "Images du PDF",
              // Best-effort context: description until full chapter threading landed
              chapterContext: classification.description,
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
): Promise<{ imagesExtracted: number; imagesUploaded: number }> {
  const images = await extractImagesFromPdf(pdfBuffer);

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

  let uploaded = 0;
  let batchesDone = 0;
  for (const batch of batches) {
    await uploadAndInsertBatch(jobId, job, course, batch);
    uploaded += batch.length;
    batchesDone++;
    await updateJob(jobId, { image_batches_completed: batchesDone });
  }

  return { imagesExtracted: images.length, imagesUploaded: uploaded };
}
