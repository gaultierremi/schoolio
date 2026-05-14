import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { logError } from "@/lib/observability/log-error";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function admin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/student/remediation?question_id=...
//
// Phase 1 (cette PR) : pose les rails. Retourne le concept lié à la question
// + ses theory_blocks + concepts voisins via la même UAA, pour qu'un futur
// RemediationCard côté élève propose un "mini-détour 3min" sur le concept
// manqué ou ses prérequis.
//
// Si question.concept_id IS NULL → on retourne juste { concept: null }.
// Le client UI doit dégrader gracieusement (afficher juste "Revoir théorie").
//
// Cette API consomme A.2 (snippet layer) indirectement : les snippets attachés
// au concept retourné peuvent être affichés directement.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const questionId = req.nextUrl.searchParams.get("question_id");
    if (typeof questionId !== "string" || !UUID_RE.test(questionId)) {
      return apiError("question_id invalide", 400);
    }

    const a = admin();

    // 1. Récup la question + son concept_id (RLS scope auto via service_role + we check below)
    const { data: q, error: qErr } = await a
      .from("teacher_questions")
      .select("id, school_id, concept_id")
      .eq("id", questionId)
      .maybeSingle();

    if (qErr) {
      await logError(qErr, { source: "api.student.remediation.GET", context: { questionId }, userId: auth.user.id });
      return apiError("Question introuvable", 500);
    }
    if (!q) return apiError("Question introuvable", 404);

    // Tenant check defense-in-depth
    const { data: profile } = await a
      .from("user_profiles")
      .select("school_id")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (!profile || profile.school_id !== (q as { school_id: string }).school_id) {
      return apiError("Accès refusé", 403);
    }

    const conceptId = (q as { concept_id: string | null }).concept_id;
    if (!conceptId) {
      return apiOk({ concept: null, neighbors: [], theory_blocks: [] });
    }

    // 2. Récup le concept + neighbors (même UAA) + theory_blocks
    const [conceptRes, theoryRes] = await Promise.all([
      a.from("concepts").select("id, name, slug, uaa_id, source_concept_path").eq("id", conceptId).maybeSingle(),
      a.from("theory_blocks").select("paragraph_ordinal, content, source_quote").eq("concept_id", conceptId).order("paragraph_ordinal", { ascending: true }).limit(10),
    ]);

    if (conceptRes.error || !conceptRes.data) {
      return apiOk({ concept: null, neighbors: [], theory_blocks: [] });
    }
    const concept = conceptRes.data as { id: string; name: string; slug: string; uaa_id: string | null; source_concept_path: string | null };

    let neighbors: Array<{ id: string; name: string; slug: string }> = [];
    if (concept.uaa_id) {
      const { data: nb } = await a
        .from("concepts")
        .select("id, name, slug")
        .eq("uaa_id", concept.uaa_id)
        .neq("id", conceptId)
        .limit(5);
      neighbors = (nb ?? []) as Array<{ id: string; name: string; slug: string }>;
    }

    return apiOk({
      concept: { id: concept.id, name: concept.name, slug: concept.slug, source_concept_path: concept.source_concept_path },
      neighbors,
      theory_blocks: theoryRes.data ?? [],
    });
  } catch (err) {
    await logError(err, { source: "api.student.remediation.GET" });
    return safeError(err, "student:remediation");
  }
}
