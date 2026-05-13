/**
 * Local E2E test for the ingestion pipeline (PR #11 refactor).
 *
 * Validates the runIngestion() orchestrator end-to-end on a real syllabus
 * (Histoire CESS G) without going through the prod /api/ingestion/trigger
 * HTTP route. This tests:
 *  - Anthropic Files API extraction (Haiku, vision)
 *  - Adaptive section detection (Claude)
 *  - Theory generation per section (Sonnet)
 *  - DB writes (concepts + theory_blocks) with provenance enforced
 *
 * Does NOT test Vercel function bundling / runtime (use a real upload via
 * /school/syllabus/upload for that).
 *
 * Usage : npx tsx scripts/run-e2e-ingestion.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { runIngestion } from "@/lib/ingestion/orchestrator";

// Minimal .env.local loader (avoids dotenv dep). Picks up any FOO=bar pair.
try {
  const lines = readFileSync(".env.local", "utf-8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch (e) {
  console.warn("Could not load .env.local:", (e as Error).message);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE || !ANTHROPIC_KEY) {
  console.error("Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ANTHROPIC_API_KEY.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const SCHOOL_ID = "00000000-0000-0000-0000-000000000001"; // FounderTestGround
const ALEX_USER_ID = "e03b39ed-e4eb-43cf-aa26-a15d54c51212";
const HISTOIRE_PROGRAM_ID = "016dc5e5-1f7c-4142-8b95-ccb2be564f04";
const PDF_PATH = `${SCHOOL_ID}/${HISTOIRE_PROGRAM_ID}/b81fb43589903ded-jury-histoire.pdf`;
const PDF_SHA256 = "b81fb43589903ded" + "0".repeat(48); // real sha truncated for db; using placeholder full hex

async function main() {
  console.log("\n=== E2E ingestion test — Histoire CESS G ===\n");

  // Compute actual sha256 from the PDF in storage
  const { data: pdfBlob, error: dlErr } = await admin.storage.from("syllabi").download(PDF_PATH);
  if (dlErr || !pdfBlob) {
    console.error("Failed to download PDF from storage:", dlErr?.message);
    process.exit(1);
  }
  const pdfBuffer = await pdfBlob.arrayBuffer();
  const { createHash } = await import("node:crypto");
  const sha = createHash("sha256").update(Buffer.from(pdfBuffer)).digest("hex");
  console.log(`PDF size : ${pdfBuffer.byteLength} bytes`);
  console.log(`PDF sha256 : ${sha}`);

  // Insert a fresh pending job
  console.log("\nInserting pending ingestion_job...");
  const { data: job, error: insErr } = await admin
    .from("ingestion_jobs")
    .insert({
      school_id: SCHOOL_ID,
      program_id: HISTOIRE_PROGRAM_ID,
      pdf_storage_path: PDF_PATH,
      pdf_sha256: sha,
      status: "pending",
      triggered_by: ALEX_USER_ID,
    })
    .select("id")
    .single();

  if (insErr || !job) {
    console.error("Failed to insert job:", insErr?.message);
    process.exit(1);
  }
  const jobId = job.id;
  console.log(`Job created : ${jobId}`);

  // Run the orchestrator in fast mode (no batch API polling)
  console.log("\nRunning runIngestion in fast mode...");
  const start = Date.now();
  try {
    await runIngestion(jobId, { fast: true });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nrunIngestion completed in ${elapsed}s`);
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`\nrunIngestion FAILED after ${elapsed}s:`, (err as Error).message);
    // Still proceed to dump final state
  }

  // Report final job state
  const { data: finalJob } = await admin
    .from("ingestion_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  console.log("\n=== Final ingestion_job state ===");
  console.log(JSON.stringify(finalJob, null, 2).slice(0, 2000));

  // Report concepts created
  const { count: conceptCount } = await admin
    .from("concepts")
    .select("id", { count: "exact", head: true })
    .eq("school_id", SCHOOL_ID)
    .eq("program_id", HISTOIRE_PROGRAM_ID);
  console.log(`\nConcepts for Histoire : ${conceptCount}`);

  // Report theory blocks
  const { data: blocks, count: blockCount } = await admin
    .from("theory_blocks")
    .select("id, concept_id, paragraph_ordinal, content, source_quote, source_concept_path", { count: "exact" })
    .eq("ingestion_job_id", jobId)
    .order("paragraph_ordinal", { ascending: true })
    .limit(3);
  console.log(`\nTheory blocks for this job : ${blockCount}`);
  if (blocks && blocks.length > 0) {
    console.log("\nSample (first 3 blocks):");
    for (const b of blocks) {
      console.log(`\n  Block ord=${b.paragraph_ordinal}`);
      console.log(`    concept_id: ${b.concept_id}`);
      console.log(`    content   : ${b.content.slice(0, 200)}${b.content.length > 200 ? "..." : ""}`);
      console.log(`    src_quote : ${b.source_quote ? `"${b.source_quote.slice(0, 120)}..."` : "(null)"}`);
      console.log(`    src_path  : ${b.source_concept_path ?? "(null)"}`);
    }
  }

  console.log("\n=== End of E2E test ===\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
