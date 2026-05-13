import { createClient } from "@supabase/supabase-js";
import { extractMarkdownFromPdf } from "@/lib/pdf/extract-markdown";
import { chunkByUaa } from "@/lib/ingestion/chunk-by-uaa";
import { createBatch, getBatchStatus, getBatchResults } from "@/lib/ingestion/batch-api";
import { buildTheoryPrompt } from "@/lib/ingestion/prompts/theory";
import { storeTheoryBlocks, type TheoryBlockInput } from "@/lib/ingestion/store-outputs";
import type Anthropic from "@anthropic-ai/sdk";

type JobStatus = "pending" | "extracting" | "chunking" | "batching" | "storing" | "done" | "failed";

export type RunOptions = {
  fast?: boolean;   // skip batch, call Anthropic sync (test/dev iteration)
};

const MAX_CONCEPTS_PER_JOB = 100;  // cost + complexity guardrail
const BATCH_POLL_INTERVAL_MS = 30_000;  // 30s
const BATCH_POLL_TIMEOUT_MS = 6 * 60 * 60 * 1000;  // 6h cap (Anthropic SLA is 24h, but the route handler will exit before that — see Task 8)

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function slugifyConceptName(uaaCode: string, label: string): string {
  const base = `${uaaCode}-${label}`.toLowerCase();
  return base.replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 150);
}

/**
 * Run the ingestion pipeline for a given job_id. Drives state through
 * extracting → chunking → batching → storing → done. On any failure
 * sets status = "failed" with error_message and rethrows.
 *
 * MUST be called server-side (uses service role key). Idempotent : reruns
 * upsert concepts on (school_id, program_id, slug) and theory_blocks on
 * (concept_id, paragraph_ordinal).
 */
export async function runIngestion(jobId: string, opts: RunOptions = {}): Promise<void> {
  const admin = adminClient();

  async function setStatus(status: JobStatus, errorMessage?: string, extra: Record<string, unknown> = {}) {
    const patch: Record<string, unknown> = { status, ...extra };
    if (status === "extracting") patch.started_at = new Date().toISOString();
    if (status === "done" || status === "failed") patch.completed_at = new Date().toISOString();
    if (errorMessage) patch.error_message = errorMessage;
    await admin.from("ingestion_jobs").update(patch).eq("id", jobId);
  }

  try {
    const { data: job, error: jobErr } = await admin
      .from("ingestion_jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (jobErr || !job) throw new Error(`Job not found: ${jobErr?.message ?? "no rows"}`);

    // ── 1. EXTRACT ────────────────────────────────────────────────────────────
    await setStatus("extracting");
    const { data: pdfBlob, error: dlErr } = await admin.storage
      .from("syllabi")
      .download(job.pdf_storage_path);
    if (dlErr || !pdfBlob) throw new Error(`PDF download failed: ${dlErr?.message ?? "no blob"}`);
    const pdfBuffer = await pdfBlob.arrayBuffer();
    const { markdown, pageCount, columnsDetected } = await extractMarkdownFromPdf(pdfBuffer);

    // ── 2. CHUNK ──────────────────────────────────────────────────────────────
    await setStatus("chunking");
    const chunks = chunkByUaa(markdown);
    if (chunks.length === 0) {
      throw new Error("No UAA headers found in syllabus — check the PDF or the chunking regex.");
    }
    if (chunks.length > MAX_CONCEPTS_PER_JOB) {
      throw new Error(`Syllabus produced ${chunks.length} UAAs — exceeds cap ${MAX_CONCEPTS_PER_JOB}. Split into multiple uploads.`);
    }

    // Upsert concepts (Sprint 1 simplification : 1 concept per UAA chunk;
    // Sprint 2 curation will let the prof split a UAA into multiple finer concepts).
    const conceptInserts = chunks.map((c) => ({
      program_id: job.program_id,
      school_id: job.school_id,
      name: c.label,
      slug: slugifyConceptName(c.code, c.label),
      source_concept_path: `${c.code} > ${c.label}`,
    }));
    const { data: conceptRows, error: cErr } = await admin
      .from("concepts")
      .upsert(conceptInserts, { onConflict: "school_id,program_id,slug" })
      .select("id, slug, name");
    if (cErr || !conceptRows) throw new Error(`Concept upsert failed: ${cErr?.message ?? "no rows"}`);

    // Map concepts back to their chunks by slug (so we can build the prompt per concept).
    const conceptsBySlug = new Map(conceptRows.map((c) => [c.slug, c]));

    // ── 3. BATCH ──────────────────────────────────────────────────────────────
    await setStatus("batching");
    const batchRequests = chunks
      .map((chunk) => {
        const slug = slugifyConceptName(chunk.code, chunk.label);
        const concept = conceptsBySlug.get(slug);
        if (!concept) return null;
        return {
          custom_id: concept.id,
          params: buildTheoryPrompt({
            schoolId: job.school_id,
            programId: job.program_id,
            conceptName: concept.name,
            conceptSlug: concept.slug,
            uaaCode: chunk.code,
            uaaLabel: chunk.label,
            syllabusContent: chunk.content,
          }),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    type RawResult = { custom_id: string; result: { type: string; message?: Anthropic.Messages.Message; error?: { type: string; message: string } } };
    let results: RawResult[];

    if (opts.fast) {
      // Synchronous mode — call Anthropic messages.create one by one.
      // Slow but immediate ; only used for dogfood iteration on small syllabi.
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
            result: { type: "errored", error: { type: "api_error", message: (err as Error).message } },
          });
        }
      }
    } else {
      const batchId = await createBatch(batchRequests);
      await admin.from("ingestion_jobs").update({ batch_id: batchId }).eq("id", jobId);

      // Poll until status === "ended" or timeout (6h). Note : the route
      // handler that called runIngestion has a 60s timeout on Vercel Hobby ;
      // this loop will exit when the route handler is killed, but the batch
      // continues on Anthropic's side. The status page polls /api/ingestion
      // separately and re-triggers runIngestion to resume.
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
      const fullJson = "{" + firstContent.text;  // re-prepend the assistant pre-fill
      try {
        const parsed = JSON.parse(fullJson) as {
          paragraphs?: { ordinal: number; content: string; source_quote: string | null; source_concept_path: string | null }[];
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

    const { inserted, rejected, rejections } = await storeTheoryBlocks(allBlocks);

    await setStatus("done", undefined, {
      metadata: {
        page_count: pageCount,
        columns_detected: columnsDetected,
        chunks: chunks.length,
        concepts: conceptRows.length,
        succeeded_results: results.filter((r) => r.result.type === "succeeded").length,
        errored_results: results.filter((r) => r.result.type === "errored").length,
        parse_failures: parseFailures,
        theory_blocks_inserted: inserted,
        theory_blocks_rejected: rejected,
        rejection_reasons: rejections.slice(0, 5).map((rej) => rej.reason),
      },
    });
  } catch (err) {
    await setStatus("failed", (err as Error).message);
    throw err;
  }
}
