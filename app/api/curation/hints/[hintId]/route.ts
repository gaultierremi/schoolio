import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";
import { isValidUuid, validateHintPutBody } from "@/lib/curation/validation";

export const runtime = "nodejs";

/**
 * PUT /api/curation/hints/[hintId]
 *
 * Sprint 5 PR S5-2 — Édition d'un hint existant.
 *
 * Body partiel : { template?, ordinal?, kind?, misconception_id? (UUID|null), approved? }
 *
 * `approved: true` publie le hint (approved_at = NOW, approved_by = teacher).
 * `approved: false` re-brouillonne (approved_at = NULL).
 *
 * Tenant check + ownership classe garantis avant écriture.
 */
export async function PUT(
  request: Request,
  { params }: { params: { hintId: string } },
) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (!isValidUuid(params.hintId)) {
    return apiError("ID hint invalide", 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError("Body JSON invalide", 400);
  }
  const validation = validateHintPutBody(rawBody);
  if (!validation.ok) return apiError(validation.error, validation.status);
  const { update } = validation;

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const profileRes = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileRes.error) throw profileRes.error;
    const schoolId = (profileRes.data as { school_id?: string } | null)?.school_id;
    if (!schoolId) return apiError("Profil utilisateur incomplet", 403);

    // Fetch hint + tenant check + question_id pour cohérence misconception
    const hintRes = await admin
      .from("question_hints")
      .select(
        "id, school_id, question_id, ordinal, template, kind, misconception_id, approved_at",
      )
      .eq("id", params.hintId)
      .maybeSingle();
    if (hintRes.error) throw hintRes.error;
    const hint = hintRes.data as
      | {
          id: string;
          school_id: string;
          question_id: string;
          ordinal: number;
          template: string;
          kind: string;
          misconception_id: string | null;
          approved_at: string | null;
        }
      | null;
    if (!hint) return apiError("Indice introuvable", 404);
    if (hint.school_id !== schoolId) return apiError("Accès refusé", 403);

    // Si on change misconception_id (vers un UUID non-null), vérifier cohérence
    if (update.misconceptionId !== undefined && update.misconceptionId !== null) {
      const questionRes = await admin
        .from("teacher_questions")
        .select("concept_id")
        .eq("id", hint.question_id)
        .maybeSingle();
      if (questionRes.error) throw questionRes.error;
      const conceptId = (questionRes.data as { concept_id: string | null } | null)?.concept_id;
      if (!conceptId) {
        return apiError(
          "La question n'a pas de concept rattaché, impossible d'associer une misconception",
          400,
        );
      }
      const miscRes = await admin
        .from("concept_misconceptions")
        .select("concept_id, school_id")
        .eq("id", update.misconceptionId)
        .maybeSingle();
      if (miscRes.error) throw miscRes.error;
      const misc = miscRes.data as { concept_id: string; school_id: string } | null;
      if (!misc) return apiError("Misconception introuvable", 404);
      if (misc.school_id !== schoolId) return apiError("Accès refusé sur misconception", 403);
      if (misc.concept_id !== conceptId) {
        return apiError("Misconception ne correspond pas au concept de la question", 400);
      }
    }

    // Build patch
    const patch: Record<string, unknown> = {};
    if (update.template !== undefined) patch.template = update.template;
    if (update.ordinal !== undefined) patch.ordinal = update.ordinal;
    if (update.kind !== undefined) patch.kind = update.kind;
    if (update.misconceptionId !== undefined) patch.misconception_id = update.misconceptionId;
    if (update.approved !== undefined) {
      if (update.approved) {
        patch.approved_at = new Date().toISOString();
        patch.approved_by = user.id;
      } else {
        patch.approved_at = null;
        patch.approved_by = null;
      }
    }

    const updateRes = await admin
      .from("question_hints")
      .update(patch)
      .eq("id", params.hintId)
      .select(
        "id, ordinal, template, kind, misconception_id, approved_at, created_at, updated_at",
      )
      .single();
    if (updateRes.error) {
      if (updateRes.error.code === "23505") {
        return apiError("Un indice existe déjà à cette position", 409);
      }
      throw updateRes.error;
    }

    const updated = updateRes.data as {
      id: string;
      ordinal: number;
      template: string;
      kind: string;
      misconception_id: string | null;
      approved_at: string | null;
      created_at: string;
      updated_at: string;
    };

    await logAuditEvent({
      actorId: user.id,
      actorEmail: user.email ?? null,
      actorRole: "teacher",
      eventType: AUDIT_EVENTS.CONCEPT_HINT_UPDATED,
      targetType: "question_hint",
      targetId: updated.id,
      details: {
        question_id: hint.question_id,
        changes: Object.keys(patch),
        // Trace publish/unpublish explicit
        published: update.approved,
      },
    });

    return apiOk({ ok: true, hint: updated });
  } catch (err) {
    return safeError(err, "curation-hints-update", "Erreur lors de la mise à jour");
  }
}

/**
 * DELETE /api/curation/hints/[hintId]
 *
 * Sprint 5 PR S5-2 — Supprime un hint.
 *
 * Cohérent avec les autres curation endpoints (concept_misconceptions DELETE).
 * Pas de soft-delete : un hint pédagogique mal rédigé doit pouvoir être retiré
 * proprement. La trace reste dans audit_log.
 *
 * Note règle CLAUDE.md #23 : la table `question_hints` n'est PAS dans la liste
 * never-DELETE (event tables) — c'est de la config pédagogique, pas un
 * événement utilisateur.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { hintId: string } },
) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (!isValidUuid(params.hintId)) {
    return apiError("ID hint invalide", 400);
  }

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const profileRes = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileRes.error) throw profileRes.error;
    const schoolId = (profileRes.data as { school_id?: string } | null)?.school_id;
    if (!schoolId) return apiError("Profil utilisateur incomplet", 403);

    const hintRes = await admin
      .from("question_hints")
      .select("id, school_id, question_id, ordinal, kind")
      .eq("id", params.hintId)
      .maybeSingle();
    if (hintRes.error) throw hintRes.error;
    const hint = hintRes.data as
      | { id: string; school_id: string; question_id: string; ordinal: number; kind: string }
      | null;
    if (!hint) return apiError("Indice introuvable", 404);
    if (hint.school_id !== schoolId) return apiError("Accès refusé", 403);

    const deleteRes = await admin.from("question_hints").delete().eq("id", params.hintId);
    if (deleteRes.error) throw deleteRes.error;

    await logAuditEvent({
      actorId: user.id,
      actorEmail: user.email ?? null,
      actorRole: "teacher",
      eventType: AUDIT_EVENTS.CONCEPT_HINT_DELETED,
      targetType: "question_hint",
      targetId: params.hintId,
      details: {
        question_id: hint.question_id,
        ordinal: hint.ordinal,
        kind: hint.kind,
      },
    });

    return apiOk({ ok: true });
  } catch (err) {
    return safeError(err, "curation-hints-delete", "Erreur lors de la suppression");
  }
}
