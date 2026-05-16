import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";

export const runtime = "nodejs";

/**
 * GET /api/curation/concepts
 *
 * Sprint 2B PR B — Liste des concepts du tenant du prof, avec compteurs
 * questions / théorie / misconceptions pour rendu dans la tab "Par concept".
 *
 * Pensé pour 500 profs scale :
 * - Limite serveur 200 concepts (au-delà, on paginera Sprint 2C+).
 * - 4 requêtes parallèles → counts via SQL count(*) (pas de N+1).
 * - Cache schedule : ce endpoint est en force-dynamic, pas cacheable côté Next.js
 *   car dépend du prof. Le browser peut cacher 30s côté client.
 *
 * Response shape :
 * {
 *   ok: true,
 *   concepts: [
 *     {
 *       id, name, slug, program_id, uaa_id,
 *       questions_total, questions_active, theory_sections_filled,
 *       misconceptions_count
 *     }
 *   ]
 * }
 */
export async function GET() {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: profile } = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    const schoolId = (profile as { school_id?: string } | null)?.school_id;
    if (!schoolId) return apiError("Profil utilisateur incomplet", 403);

    // 1. Concepts du tenant (limité 200, ordonné par name)
    const { data: conceptsData, error: cErr } = await admin
      .from("concepts")
      .select("id, name, slug, program_id, uaa_id, description")
      .eq("school_id", schoolId)
      .order("name", { ascending: true })
      .limit(200);
    if (cErr) throw cErr;
    const concepts = (conceptsData ?? []) as Array<{
      id: string;
      name: string;
      slug: string;
      program_id: string;
      uaa_id: string | null;
      description: string | null;
    }>;

    if (concepts.length === 0) {
      return apiOk({ ok: true, concepts: [] });
    }

    const conceptIds = concepts.map((c) => c.id);

    // 2. Counts en parallèle. On évite le N+1 en faisant 3 fetches puis
    //    on agrège côté Node (200 concepts × 3 fetches = 600 rows max,
    //    négligeable).
    const [qRes, tRes, mRes] = await Promise.all([
      admin
        .from("teacher_questions")
        .select("concept_id, is_active")
        .in("concept_id", conceptIds)
        .eq("school_id", schoolId),
      admin
        .from("theory_blocks")
        .select("concept_id, section_kind")
        .in("concept_id", conceptIds),
      admin
        .from("concept_misconceptions")
        .select("concept_id")
        .in("concept_id", conceptIds),
    ]);

    const qRows = (qRes.data ?? []) as Array<{ concept_id: string; is_active: boolean }>;
    const tRows = (tRes.data ?? []) as Array<{
      concept_id: string;
      section_kind: string | null;
    }>;
    const mRows = (mRes.data ?? []) as Array<{ concept_id: string }>;

    // Agrégation O(N) avec Maps.
    const qTotalByConcept = new Map<string, number>();
    const qActiveByConcept = new Map<string, number>();
    for (const row of qRows) {
      qTotalByConcept.set(row.concept_id, (qTotalByConcept.get(row.concept_id) ?? 0) + 1);
      if (row.is_active) {
        qActiveByConcept.set(row.concept_id, (qActiveByConcept.get(row.concept_id) ?? 0) + 1);
      }
    }

    const theoryFilledByConcept = new Map<string, Set<string>>();
    for (const row of tRows) {
      if (!row.section_kind) continue;
      const set = theoryFilledByConcept.get(row.concept_id) ?? new Set<string>();
      set.add(row.section_kind);
      theoryFilledByConcept.set(row.concept_id, set);
    }

    const mCountByConcept = new Map<string, number>();
    for (const row of mRows) {
      mCountByConcept.set(row.concept_id, (mCountByConcept.get(row.concept_id) ?? 0) + 1);
    }

    const enriched = concepts.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      program_id: c.program_id,
      uaa_id: c.uaa_id,
      description: c.description,
      questions_total: qTotalByConcept.get(c.id) ?? 0,
      questions_active: qActiveByConcept.get(c.id) ?? 0,
      theory_sections_filled: theoryFilledByConcept.get(c.id)?.size ?? 0,
      misconceptions_count: mCountByConcept.get(c.id) ?? 0,
    }));

    return apiOk({ ok: true, concepts: enriched });
  } catch (err) {
    return safeError(err, "curation-concepts-list", "Erreur lors du chargement des concepts");
  }
}
