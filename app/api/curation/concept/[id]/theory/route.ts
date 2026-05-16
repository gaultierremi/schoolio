import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";
import { isValidUuid, nextOrdinal, validateTheoryPutBody } from "@/lib/curation/validation";

export const runtime = "nodejs";

/**
 * PUT /api/curation/concept/[id]/theory
 *
 * Sprint 2B — Met à jour (ou crée) une section de théorie pour un concept.
 *
 * Body : { section_kind: "definition"|"formules"|"exemples"|"prerequis"|"pieges", content: string }
 *
 * Sémantique upsert par (concept_id, section_kind) au niveau API (pas de
 * UNIQUE DB en transition — cf. migration 20260517010000) :
 *   - Si une row existe déjà avec ce section_kind → UPDATE content + needs_teacher_review=false + approved_at=now
 *   - Sinon → INSERT avec paragraph_ordinal = MAX(ordinal)+1 du concept
 *
 * Auth : prof connecté + concept doit appartenir à son tenant (RLS vérifie aussi).
 */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (!isValidUuid(params.id)) {
    return apiError("ID concept invalide", 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError("Body JSON invalide", 400);
  }

  const validation = validateTheoryPutBody(rawBody);
  if (!validation.ok) return apiError(validation.error, validation.status);
  const { sectionKind, content } = validation;

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1. Verify concept exists + belongs to user's school (also re-checks tenant
    //    even si RLS le ferait — on veut un 404/403 explicite).
    const { data: profile } = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    const schoolId = (profile as { school_id?: string } | null)?.school_id;
    if (!schoolId) return apiError("Profil utilisateur incomplet", 403);

    const { data: concept } = await admin
      .from("concepts")
      .select("id, school_id")
      .eq("id", params.id)
      .maybeSingle();
    if (!concept) return apiError("Concept introuvable", 404);
    if ((concept as { school_id: string }).school_id !== schoolId) {
      return apiError("Accès refusé", 403);
    }

    // 2. Upsert par (concept_id, section_kind)
    const { data: existing } = await admin
      .from("theory_blocks")
      .select("id, paragraph_ordinal, updated_at")
      .eq("concept_id", params.id)
      .eq("section_kind", sectionKind)
      .maybeSingle();

    let resultId: string;
    let resultUpdatedAt: string;

    if (existing) {
      const { data: updated, error: upErr } = await admin
        .from("theory_blocks")
        .update({
          content,
          needs_teacher_review: false,
          approved_at: new Date().toISOString(),
          approved_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (existing as { id: string }).id)
        .select("id, updated_at")
        .single();
      if (upErr || !updated) throw upErr ?? new Error("update failed");
      resultId = (updated as { id: string; updated_at: string }).id;
      resultUpdatedAt = (updated as { id: string; updated_at: string }).updated_at;
    } else {
      // Auto paragraph_ordinal : MAX(ordinal)+1 du concept (théorie peut avoir
      // jusqu'à 10 paragraphes par concept, cf. CHECK migration ingestion_schema).
      const { data: maxRow } = await admin
        .from("theory_blocks")
        .select("paragraph_ordinal")
        .eq("concept_id", params.id)
        .order("paragraph_ordinal", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextOrd = nextOrdinal(
        (maxRow as { paragraph_ordinal?: number } | null)?.paragraph_ordinal,
        10,
      );
      if (nextOrd === null) {
        return apiError("Concept déjà saturé (10 paragraphes max)", 409);
      }

      const { data: inserted, error: insErr } = await admin
        .from("theory_blocks")
        .insert({
          concept_id: params.id,
          school_id: schoolId,
          paragraph_ordinal: nextOrd,
          section_kind: sectionKind,
          content,
          source_concept_path: `manual:${user.id}`,
          needs_teacher_review: false,
          approved_at: new Date().toISOString(),
          approved_by: user.id,
        })
        .select("id, updated_at")
        .single();
      if (insErr || !inserted) throw insErr ?? new Error("insert failed");
      resultId = (inserted as { id: string; updated_at: string }).id;
      resultUpdatedAt = (inserted as { id: string; updated_at: string }).updated_at;
    }

    await logAuditEvent({
      actorId: user.id,
      actorEmail: user.email ?? null,
      actorRole: "teacher",
      eventType: AUDIT_EVENTS.CONCEPT_THEORY_UPDATED,
      targetType: "theory_block",
      targetId: resultId,
      details: { concept_id: params.id, section_kind: sectionKind, length: content.length },
    });

    return apiOk({
      ok: true,
      id: resultId,
      section_kind: sectionKind,
      updated_at: resultUpdatedAt,
    });
  } catch (err) {
    return safeError(err, "curation-concept-theory", "Erreur lors de la sauvegarde");
  }
}
