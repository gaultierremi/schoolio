/**
 * GET /api/student/concept/[id]/theory
 *
 * Sprint 6+ — Lecture théorie d'un concept pour l'élève au sein du quiz
 * (panel "Revoir la théorie" intégré, plus de PDF download).
 *
 * Retourne les `theory_blocks` approuvés du concept (5 sections : definition,
 * formules, exemples, prerequis, pieges) + le nom du concept.
 *
 * Auth : requireUser (élève authentifié, tenant scope via school_id check).
 *
 * Anti-leak : on ne retourne que les blocks `approved_at IS NOT NULL` (le prof
 * valide explicitement avant que l'élève voit). Sinon brouillons exposés.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "ID concept invalide" }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Tenant check : récupère school_id du user
  const profileRes = await admin
    .from("user_profiles")
    .select("school_id")
    .eq("id", user.id)
    .maybeSingle();
  const schoolId = (profileRes.data as { school_id?: string } | null)?.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "Profil incomplet" }, { status: 403 });
  }

  // Concept + tenant filter
  const conceptRes = await admin
    .from("concepts")
    .select("id, name, description, school_id")
    .eq("id", params.id)
    .maybeSingle();
  const concept = conceptRes.data as
    | { id: string; name: string; description: string | null; school_id: string }
    | null;
  if (!concept) return NextResponse.json({ error: "Concept introuvable" }, { status: 404 });
  if (concept.school_id !== schoolId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Theory blocks approved uniquement
  const blocksRes = await admin
    .from("theory_blocks")
    .select("id, paragraph_ordinal, section_kind, content")
    .eq("concept_id", params.id)
    .not("approved_at", "is", null)
    .order("paragraph_ordinal", { ascending: true });
  const blocks = blocksRes.data ?? [];

  // Misconceptions (pièges) du concept — affichés en pied de panel
  const miscsRes = await admin
    .from("concept_misconceptions")
    .select("id, label, ordinal")
    .eq("concept_id", params.id)
    .order("ordinal", { ascending: true });
  const misconceptions = miscsRes.data ?? [];

  return NextResponse.json({
    concept: { id: concept.id, name: concept.name, description: concept.description },
    blocks,
    misconceptions,
  });
}
