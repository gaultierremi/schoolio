import { createClient as createSupabaseAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";
import { isValidUuid, validateMisconceptionPutBody } from "@/lib/curation/validation";

export const runtime = "nodejs";

/**
 * Vérifie que :
 *  1. params.id (concept) et params.mid (misconception) sont des UUID
 *  2. La misconception existe et appartient au tenant du prof
 *  3. La misconception est bien rattachée au concept de l'URL
 * Retourne { schoolId, misconception } ou une NextResponse d'erreur.
 */
async function checkAccess(
  admin: SupabaseClient,
  userId: string,
  conceptId: string,
  misconceptionId: string,
) {
  if (!isValidUuid(conceptId)) return { error: apiError("ID concept invalide", 400) };
  if (!isValidUuid(misconceptionId)) return { error: apiError("ID misconception invalide", 400) };

  const { data: profile } = await admin
    .from("user_profiles")
    .select("school_id")
    .eq("id", userId)
    .maybeSingle();
  const schoolId = (profile as { school_id?: string } | null)?.school_id;
  if (!schoolId) return { error: apiError("Profil utilisateur incomplet", 403) };

  const { data: m } = await admin
    .from("concept_misconceptions")
    .select("id, concept_id, school_id, label, ordinal")
    .eq("id", misconceptionId)
    .maybeSingle();
  if (!m) return { error: apiError("Misconception introuvable", 404) };
  const row = m as {
    id: string;
    concept_id: string;
    school_id: string;
    label: string;
    ordinal: number;
  };
  if (row.school_id !== schoolId) return { error: apiError("Accès refusé", 403) };
  if (row.concept_id !== conceptId) return { error: apiError("Misconception non liée à ce concept", 404) };

  return { schoolId, misconception: row };
}

/**
 * PUT /api/curation/concept/[id]/misconceptions/[mid]
 *
 * Body : { label?: string, ordinal?: number }
 * Au moins un des deux doit être fourni.
 */
export async function PUT(
  request: Request,
  { params }: { params: { id: string; mid: string } },
) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError("Body JSON invalide", 400);
  }

  const validation = validateMisconceptionPutBody(rawBody);
  if (!validation.ok) return apiError(validation.error, validation.status);
  const { update } = validation;

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const access = await checkAccess(admin, user.id, params.id, params.mid);
    if (access.error) return access.error;

    const { data: updated, error: upErr } = await admin
      .from("concept_misconceptions")
      .update(update)
      .eq("id", params.mid)
      .select("id, label, ordinal, created_at, updated_at")
      .single();
    if (upErr || !updated) {
      // 23505 = unique violation (ordinal déjà pris)
      const code = (upErr as { code?: string } | null)?.code;
      if (code === "23505") {
        return apiError("Cet ordinal est déjà utilisé pour ce concept", 409);
      }
      throw upErr ?? new Error("update failed");
    }

    const updatedRow = updated as {
      id: string;
      label: string;
      ordinal: number;
      created_at: string;
      updated_at: string;
    };

    await logAuditEvent({
      actorId: user.id,
      actorEmail: user.email ?? null,
      actorRole: "teacher",
      eventType: AUDIT_EVENTS.CONCEPT_MISCONCEPTION_UPDATED,
      targetType: "concept_misconception",
      targetId: updatedRow.id,
      details: { concept_id: params.id, changed_fields: Object.keys(update) },
    });

    return apiOk({ ok: true, misconception: updatedRow });
  } catch (err) {
    return safeError(err, "curation-misconceptions-update", "Erreur lors de la mise à jour");
  }
}

/**
 * DELETE /api/curation/concept/[id]/misconceptions/[mid]
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; mid: string } },
) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const access = await checkAccess(admin, user.id, params.id, params.mid);
    if (access.error) return access.error;

    const { error: delErr } = await admin
      .from("concept_misconceptions")
      .delete()
      .eq("id", params.mid);
    if (delErr) throw delErr;

    await logAuditEvent({
      actorId: user.id,
      actorEmail: user.email ?? null,
      actorRole: "teacher",
      eventType: AUDIT_EVENTS.CONCEPT_MISCONCEPTION_DELETED,
      targetType: "concept_misconception",
      targetId: params.mid,
      details: {
        concept_id: params.id,
        label: access.misconception.label,
        ordinal: access.misconception.ordinal,
      },
    });

    return apiOk({ ok: true });
  } catch (err) {
    return safeError(err, "curation-misconceptions-delete", "Erreur lors de la suppression");
  }
}
