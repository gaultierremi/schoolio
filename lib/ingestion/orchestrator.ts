import { createClient } from "@supabase/supabase-js";
import { extractMarkdownFromPdf } from "@/lib/pdf/extract-markdown";
import {
  detectSections,
  chunkSections,
  type SectionChunk,
} from "@/lib/ingestion/detect-sections";
import {
  createBatch,
  getBatchStatus,
  getBatchResults,
} from "@/lib/ingestion/batch-api";
import { buildTheoryPrompt } from "@/lib/ingestion/prompts/theory";
import {
  storeTheoryBlocks,
  type TheoryBlockInput,
} from "@/lib/ingestion/store-outputs";
import { logError } from "@/lib/observability/log-error";
import type Anthropic from "@anthropic-ai/sdk";

type JobStatus =
  | "pending"
  | "extracting"
  | "chunking"
  | "batching"
  | "storing"
  | "done"
  | "failed";

export type RunOptions = {
  fast?: boolean; // skip batch, call Anthropic sync (test/dev iteration)
};

const MAX_CONCEPTS_PER_JOB = 100; // cost + complexity guardrail
const BATCH_POLL_INTERVAL_MS = 30_000;
const BATCH_POLL_TIMEOUT_MS = 6 * 60 * 60 * 1000;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function slugifyConceptName(code: string | null, label: string): string {
  const base = `${code ?? "section"}-${label}`.toLowerCase();
  return base
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 150);
}

/**
 * Run the ingestion pipeline for a given job_id. Drives state through
 * extracting → chunking → batching → storing → done.
 *
 * Architecture (post-refactor) :
 *   1. Download PDF from storage
 *   2. Extract full markdown via Anthropic Files API + STORE in
 *      ingestion_jobs.extracted_markdown (strategic asset for future
 *      Sprint 1.5+ features : hints, tutor, revisions, search)
 *   3. Detect pedagogical sections via Claude on the stored markdown
 *      (adaptive — works for UAA / Période / Compétence / Thème /
 *      whatever the FW-B program uses)
 *   4. Upsert concepts (1 per detected section), batch theory prompts
 *   5. Store theory_blocks with provenance enforced
 *
 * MUST be called server-side (uses service role key). Idempotent : reruns
 * upsert concepts on (school_id, program_id, slug) and theory_blocks on
 * (concept_id, paragraph_ordinal).
 */
export async function runIngestion(
  jobId: string,
  opts: RunOptions = {},
): Promise<void> {
  const admin = adminClient();

  async function setStatus(
    status: JobStatus,
    errorMessage?: string,
    extra: Record<string, unknown> = {},
  ) {
    const patch: Record<string, unknown> = { status, ...extra };
    if (status === "extracting") patch.started_at = new Date().toISOString();
    if (status === "done" || status === "failed")
      patch.completed_at = new Date().toISOString();
    if (errorMessage) patch.error_message = errorMessage;
    await admin.from("ingestion_jobs").update(patch).eq("id", jobId);
  }

  try {
    const { data: job, error: jobErr } = await admin
      .from("ingestion_jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (jobErr || !job)
      throw new Error(`Job not found: ${jobErr?.message ?? "no rows"}`);

    // Fetch the program subject — needed for the section-detection prompt
    const { data: program } = await admin
      .from("curriculum_programs")
      .select("subject, display_name")
      .eq("id", job.program_id)
      .single();
    const subject = (program?.subject as string | undefined) ?? "matière";

    // ── 1. EXTRACT ────────────────────────────────────────────────────────────
    await setStatus("extracting");
    const { data: pdfBlob, error: dlErr } = await admin.storage
      .from("syllabi")
      .download(job.pdf_storage_path);
    if (dlErr || !pdfBlob)
      throw new Error(`PDF download failed: ${dlErr?.message ?? "no blob"}`);
    const pdfBuffer = await pdfBlob.arrayBuffer();
    const { markdown, pageCount, columnsDetected } =
      await extractMarkdownFromPdf(pdfBuffer);

    // Store the extracted markdown as a strategic asset (used by Sprint 1.5+
    // features : hints grounded in verbatim text, tutor passage references,
    // revision card generation, source_quote provenance verification).
    await admin
      .from("ingestion_jobs")
      .update({ extracted_markdown: markdown })
      .eq("id", jobId);

    // ── 2. CHUNK (adaptive section detection via Claude) ─────────────────────
    await setStatus("chunking");
    const detected = await detectSections(markdown, subject);
    const sections: SectionChunk[] = chunkSections(markdown, detected);

    if (sections.length === 0) {
      throw new Error(
        "No sections could be located in the syllabus markdown — Claude detected sections but their markers didn't match the source text. Check the extraction quality.",
      );
    }
    if (sections.length > MAX_CONCEPTS_PER_JOB) {
      throw new Error(
        `Syllabus produced ${sections.length} sections — exceeds cap ${MAX_CONCEPTS_PER_JOB}. Use Sprint 2 curation to merge before re-running.`,
      );
    }

    // Upsert concepts (1 per detected section).
    const conceptInserts = sections.map((s) => ({
      program_id: job.program_id,
      school_id: job.school_id,
      name: s.label,
      slug: slugifyConceptName(s.code, s.label),
      source_concept_path: s.code
        ? `${s.code} > ${s.label}`
        : `Section ${s.ordinal} > ${s.label}`,
    }));
    const { data: conceptRows, error: cErr } = await admin
      .from("concepts")
      .upsert(conceptInserts, { onConflict: "school_id,program_id,slug" })
      .select("id, slug, name");
    if (cErr || !conceptRows)
      throw new Error(`Concept upsert failed: ${cErr?.message ?? "no rows"}`);

    const conceptsBySlug = new Map(conceptRows.map((c) => [c.slug, c]));

    // ── 3. BATCH (theory generation per section) ─────────────────────────────
    await setStatus("batching");
    const batchRequests = sections
      .map((section) => {
        const slug = slugifyConceptName(section.code, section.label);
        const concept = conceptsBySlug.get(slug);
        if (!concept) return null;
        return {
          custom_id: concept.id,
          params: buildTheoryPrompt({
            schoolId: job.school_id,
            programId: job.program_id,
            conceptName: concept.name,
            conceptSlug: concept.slug,
            uaaCode: section.code ?? `Section${section.ordinal}`,
            uaaLabel: section.label,
            syllabusContent: section.content,
          }),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    type RawResult = {
      custom_id: string;
      result: {
        type: string;
        message?: Anthropic.Messages.Message;
        error?: { type: string; message: string };
      };
    };
    let results: RawResult[];

    if (opts.fast) {
      const AnthropicSDK = (await import("@anthropic-ai/sdk")).default;
      const client = new AnthropicSDK();
      results = [];
      for (const req of batchRequests) {
        try {
          const msg = await client.messages.create(req.params);
          results.push({
            custom_id: req.custom_id,
            result: { type: "succeeded", message: msg },
          });
        } catch (err) {
          results.push({
            custom_id: req.custom_id,
            result: {
              type: "errored",
              error: { type: "api_error", message: (err as Error).message },
            },
          });
        }
      }
    } else {
      const batchId = await createBatch(batchRequests);
      await admin
        .from("ingestion_jobs")
        .update({ batch_id: batchId })
        .eq("id", jobId);
      const start = Date.now();
      while (Date.now() - start < BATCH_POLL_TIMEOUT_MS) {
        const status = await getBatchStatus(batchId);
        if (status.status === "ended") break;
        await new Promise((r) => setTimeout(r, BATCH_POLL_INTERVAL_MS));
      }
      results = (await getBatchResults(batchId)) as unknown as RawResult[];
    }

    // ── 4. STORE ──────────────────────────────────────────────────────────────
    await setStatus("storing");
    const allBlocks: TheoryBlockInput[] = [];
    let parseFailures = 0;

    for (const r of results) {
      if (r.result.type !== "succeeded" || !r.result.message) continue;
      const firstContent = r.result.message.content[0];
      if (firstContent.type !== "text") continue;
      const fullJson = "{" + firstContent.text;
      try {
        const parsed = JSON.parse(fullJson) as {
          paragraphs?: {
            ordinal: number;
            content: string;
            source_quote: string | null;
            source_concept_path: string | null;
          }[];
        };
        for (const p of parsed.paragraphs ?? []) {
          allBlocks.push({
            concept_id: r.custom_id,
            school_id: job.school_id,
            paragraph_ordinal: p.ordinal,
            content: p.content,
            source_quote: p.source_quote ?? null,
            source_concept_path: p.source_concept_path ?? null,
            ingestion_job_id: jobId,
          });
        }
      } catch {
        parseFailures++;
      }
    }

    const { inserted, rejected, rejections } =
      await storeTheoryBlocks(allBlocks);

    await setStatus("done", undefined, {
      metadata: {
        page_count: pageCount,
        columns_detected: columnsDetected,
        markdown_chars: markdown.length,
        sections_detected: detected.length,
        sections_chunked: sections.length,
        concepts: conceptRows.length,
        succeeded_results: results.filter((r) => r.result.type === "succeeded")
          .length,
        errored_results: results.filter((r) => r.result.type === "errored")
          .length,
        parse_failures: parseFailures,
        theory_blocks_inserted: inserted,
        theory_blocks_rejected: rejected,
        rejection_reasons: rejections.slice(0, 5).map((rej) => rej.reason),
      },
    });
  } catch (err) {
    // Record the full stack + context in error_logs (not just err.message in
    // ingestion_jobs.error_message — that's what made Sprint 1 debug slow).
    await logError(err, {
      source: "orchestrator.runIngestion",
      context: { jobId, fast: opts.fast === true },
    });
    await setStatus("failed", (err as Error).message);
    throw err;
  }
}
