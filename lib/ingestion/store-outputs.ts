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

export type SnippetSyncResult = {
  inserted: number;
  skipped: number;
};

type TheoryBlockRow = {
  id: string;
  concept_id: string;
  school_id: string;
  paragraph_ordinal: number;
  source_quote: string | null;
  ingestion_job_id: string | null;
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

/**
 * Mirror theory_blocks.source_quote into content_snippets (kind='theory_block'),
 * pour que le tuteur socratique (A.3-A.5) puisse retrieve les passages du
 * syllabus pertinents pour un concept via une seule table — au lieu de UNION
 * across theory_blocks/concepts à chaque appel Claude.
 *
 * Idempotent : ON CONFLICT DO NOTHING via uq_content_snippets_auto_origin.
 * Re-runs same job → no-op. Si le source_quote change suite à une re-ingestion
 * (rare, modèle a rephrasé), le snippet reste tel quel — c'est OK pour dogfood,
 * Sprint 2 curation laissera le prof éditer manuellement.
 */
export async function syncSnippetsFromTheoryBlocks(
  ingestionJobId: string,
): Promise<SnippetSyncResult> {
  const supabase = admin();

  // Re-lire les theory_blocks pour récupérer les vrais ids générés par
  // l'upsert (storeTheoryBlocks ne retourne pas les rows). On filtre par job.
  const { data: blocks, error: readErr } = await supabase
    .from("theory_blocks")
    .select("id, concept_id, school_id, paragraph_ordinal, source_quote, ingestion_job_id")
    .eq("ingestion_job_id", ingestionJobId)
    .not("source_quote", "is", null);

  if (readErr) {
    throw new Error(`theory_blocks read for snippet sync failed: ${readErr.message}`);
  }

  const rows = (blocks ?? []) as TheoryBlockRow[];
  const snippetInserts = rows
    .filter((r) => r.source_quote !== null && r.source_quote.length >= 20 && r.source_quote.length <= 4000)
    .map((r) => ({
      concept_id: r.concept_id,
      school_id: r.school_id,
      text: r.source_quote as string,
      source_kind: "theory_block" as const,
      source_ref: { theory_block_id: r.id, paragraph_ordinal: r.paragraph_ordinal },
      ingestion_job_id: ingestionJobId,
    }));

  const skipped = rows.length - snippetInserts.length;

  if (snippetInserts.length === 0) {
    return { inserted: 0, skipped };
  }

  // ON CONFLICT DO NOTHING via la partial unique index uq_content_snippets_auto_origin.
  // Le client Supabase n'expose pas directement DO NOTHING — on utilise upsert avec
  // ignoreDuplicates: true (équivalent SQL).
  const { error: insErr, count } = await supabase
    .from("content_snippets")
    .upsert(snippetInserts, {
      onConflict: "concept_id,source_kind,source_ref",
      ignoreDuplicates: true,
      count: "exact",
    });

  if (insErr) {
    throw new Error(`content_snippets sync failed: ${insErr.message}`);
  }

  return { inserted: count ?? snippetInserts.length, skipped };
}
