import type { SupabaseClient } from "@supabase/supabase-js";

export type ContentSnippet = {
  id: string;
  concept_id: string;
  text: string;
  source_kind: "concept_definition" | "theory_block" | "manual_teacher";
  source_ref: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
};

export type RetrieveOptions = {
  /**
   * Restrict to specific source kinds. Default = all kinds.
   * Common pattern : ['concept_definition', 'theory_block'] for grounding
   * Claude on syllabus content ; ['manual_teacher'] for prof annotations.
   */
  kinds?: ContentSnippet["source_kind"][];
  /**
   * Max number of snippets returned. Default 30. Tuteur socratique typically
   * needs 3-10 to ground a response without blowing the context budget.
   */
  limit?: number;
};

/**
 * Fetch syllabus snippets for a concept, used by the tuteur socratique,
 * indices, remediation, and error explanation flows (A.3-A.5).
 *
 * Returns rows scoped by RLS (school-bound). Caller must pass a Supabase
 * client already authenticated as the calling user — passing service_role
 * bypasses RLS and may leak cross-tenant data.
 *
 * Ordering : auto snippets first (concept_definition, theory_block) then
 * manual_teacher, then by created_at. The tuteur typically wants auto
 * grounding first, manual annotations as "extra context".
 */
export async function getSnippetsForConcept(
  supabase: SupabaseClient,
  conceptId: string,
  opts: RetrieveOptions = {},
): Promise<ContentSnippet[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 30, 200));

  let query = supabase
    .from("content_snippets")
    .select("id, concept_id, text, source_kind, source_ref, created_at, created_by")
    .eq("concept_id", conceptId)
    .order("source_kind", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (opts.kinds && opts.kinds.length > 0) {
    query = query.in("source_kind", opts.kinds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`getSnippetsForConcept failed: ${error.message}`);
  }

  return (data ?? []) as ContentSnippet[];
}

/**
 * Concat snippets into a single block of grounding text suitable for a
 * Claude system prompt. Each snippet is prefixed with its kind so the
 * model can weight teacher annotations vs syllabus extracts.
 *
 * Caps the total at ~12k chars (≈3k tokens) to leave room for the
 * conversation in the model's context window.
 */
export function formatSnippetsForPrompt(snippets: ContentSnippet[]): string {
  const MAX_CHARS = 12000;
  const out: string[] = [];
  let total = 0;

  for (const s of snippets) {
    const label = s.source_kind === "manual_teacher" ? "[Annotation prof]" : "[Syllabus]";
    const block = `${label}\n${s.text}`;
    if (total + block.length > MAX_CHARS) break;
    out.push(block);
    total += block.length + 2;
  }

  return out.join("\n\n");
}
