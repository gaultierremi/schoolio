// Pipeline B : extract images locales -> upload Supabase Storage -> INSERT pdf_extracted_images.
// Vision Haiku classification wired in PR 5 (best-effort, rows sans classification skipées en PR 6).
// Toujours derriere PIPELINE_B_ENABLED feature flag (cf orchestrator).

import { extractImagesFromPdf, type ExtractedImage } from "@/lib/pdf/extract-images";
import { withAdminClient } from "@/lib/db/admin-client";
import { logError } from "@/lib/observability/log-error";
import { classifyImage } from "./vision-classify";

type JobRow = {
  id: string;
  course_id: string;
  teacher_id: string;
  school_id: string;
};

type CourseRow = {
  id: string;
  teacher_id: string;
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
      // without classification; PR 6 will skip unclassified rows.
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
      }
    });
  }
}

export async function runImagePipeline(
  jobId: string,
  _job: JobRow,
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
    await uploadAndInsertBatch(jobId, course, batch);
    uploaded += batch.length;
    batchesDone++;
    await updateJob(jobId, { image_batches_completed: batchesDone });
  }

  return { imagesExtracted: images.length, imagesUploaded: uploaded };
}
