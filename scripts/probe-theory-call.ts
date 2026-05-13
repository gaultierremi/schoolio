/**
 * Probe : call Anthropic with the EXACT payload buildTheoryPrompt() would emit
 * for one section of the Histoire ingestion. Captures the full error so we can
 * see what's failing on 18/18 errored_results.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildTheoryPrompt } from "@/lib/ingestion/prompts/theory";
import Anthropic from "@anthropic-ai/sdk";

try {
  const lines = readFileSync(".env.local", "utf-8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // Use the most recent done-ish job to fetch a real section
  const { data: job } = await admin
    .from("ingestion_jobs")
    .select("id, extracted_markdown, school_id, program_id")
    .order("triggered_at", { ascending: false })
    .limit(1)
    .single();

  if (!job?.extracted_markdown) {
    console.error("No job with extracted_markdown found.");
    process.exit(1);
  }

  // Get one concept from this job
  const { data: concepts } = await admin
    .from("concepts")
    .select("id, slug, name, source_concept_path")
    .eq("school_id", job.school_id)
    .eq("program_id", job.program_id)
    .limit(1);

  if (!concepts || concepts.length === 0) {
    console.error("No concepts found.");
    process.exit(1);
  }

  const c = concepts[0];
  console.log(`Testing with concept : ${c.name} (slug=${c.slug})`);

  // Build a minimal valid prompt with a snippet of the markdown
  const sample = job.extracted_markdown.slice(0, 3000);
  const params = buildTheoryPrompt({
    schoolId: job.school_id,
    programId: job.program_id,
    conceptName: c.name,
    conceptSlug: c.slug,
    uaaCode: "UAA1",
    uaaLabel: c.name,
    syllabusContent: sample,
  });

  console.log(`Model: ${params.model}`);
  console.log(`Max tokens: ${params.max_tokens}`);
  console.log(`Messages count: ${params.messages.length}`);
  console.log(`First message content size: ${
    Array.isArray(params.messages[0].content) && params.messages[0].content[0].type === "text"
      ? params.messages[0].content[0].text.length
      : "n/a"
  } chars`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  console.log("\nCalling client.messages.create()...");

  try {
    const msg = await client.messages.create(params);
    console.log("\n✅ SUCCESS");
    console.log(`stop_reason: ${msg.stop_reason}`);
    console.log(`input_tokens: ${msg.usage.input_tokens}`);
    console.log(`output_tokens: ${msg.usage.output_tokens}`);
    const first = msg.content[0];
    if (first.type === "text") {
      console.log(`\nFirst 500 chars of response:\n${first.text.slice(0, 500)}`);
    }
  } catch (err) {
    console.error("\n❌ FAILED");
    const e = err as Error & { status?: number; error?: unknown };
    console.error(`Error name: ${e.name}`);
    console.error(`Error message: ${e.message}`);
    if (e.status) console.error(`HTTP status: ${e.status}`);
    if (e.error) console.error(`API error body: ${JSON.stringify(e.error, null, 2)}`);
    // Dump full error object
    console.error(`\nFull error object:\n${JSON.stringify(err, Object.getOwnPropertyNames(err), 2).slice(0, 2000)}`);
  }
}

main().catch((err) => {
  console.error("Unhandled:", err);
  process.exit(1);
});
