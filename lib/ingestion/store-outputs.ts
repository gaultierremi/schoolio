import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type TheoryBlockInput = {
  concept_id: string;
  school_id: string;
  paragraph_ordinal: number;
  content: string;
  source_quote: string | null;
  source_concept_path: string | null;
  ingestion_job_id: string;
};

export type StoreResult = {
  inserted: number;
  rejected: number;
  rejections: { reason: string; row: TheoryBlockInput }[];
};

/**
 * Upserts theory blocks with provenance validation. Rejects any row where
 * BOTH source_quote and source_concept_path are null (also enforced by the
 * DB CHECK — this is fail-fast at the lib boundary).
 *
 * Uses upsert on (concept_id, paragraph_ordinal) so re-running a job
 * cleanly replaces previous output for the same concept+ordinal.
 */
export async function storeTheoryBlocks(rows: TheoryBlockInput[]): Promise<StoreResult> {
  const rejections: StoreResult["rejections"] = [];
  const validRows: TheoryBlockInput[] = [];

  for (const r of rows) {
    if (!r.source_quote && !r.source_concept_path) {
      rejections.push({ reason: "no provenance (source_quote + source_concept_path both null)", row: r });
      continue;
    }
    if (r.content.length === 0 || r.content.length > 4000) {
      rejections.push({ reason: `content length out of bounds (${r.content.length})`, row: r });
      continue;
    }
    if (r.paragraph_ordinal < 1 || r.paragraph_ordinal > 10) {
      rejections.push({ reason: `paragraph_ordinal out of bounds (${r.paragraph_ordinal})`, row: r });
      continue;
    }
    validRows.push(r);
  }

  if (validRows.length === 0) {
    return { inserted: 0, rejected: rejections.length, rejections };
  }

  const { error } = await admin()
    .from("theory_blocks")
    .upsert(validRows, { onConflict: "concept_id,paragraph_ordinal" });

  if (error) {
    throw new Error(`theory_blocks upsert failed: ${error.message}`);
  }

  return { inserted: validRows.length, rejected: rejections.length, rejections };
}
