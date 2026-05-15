import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { PIN_COOKIE_NAME } from "@/lib/auth/pin-cookie";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";

export const runtime = "nodejs";

function getRole(appMeta: unknown): "student" | "teacher" | "system" {
  const role = (appMeta as Record<string, unknown>)?.role;
  if (role === "student" || role === "teacher") return role;
  return "system";
}

/**
 * POST /api/parametres/delete-account
 *
 * Sprint 1B — RGPD Art. 17 droit à l'effacement avec préservation des
 * données événementielles anonymisées (règle interne #23 CLAUDE.md).
 *
 * Étapes (ordre important pour atomicité best-effort) :
 *  1. Audit log AVANT toute modif (account_deletion_requested + anonymized)
 *  2. INSERT dans anonymized_users avec snapshot class_ids
 *  3. UPDATE user_profiles : retire PII (first_name, last_name, pseudo, email)
 *  4. DELETE user_pin row
 *  5. Clear app_metadata (role conservé pour les logs historiques, has_pin retiré)
 *  6. Clear cookie PIN
 *  7. Return ok → le client appelle supabase.auth.signOut + redirect /
 *
 * Note : on ne fait PAS auth.admin.deleteUser car cela cascadeDELETE-erait
 * les tables événementielles (FK ON DELETE CASCADE sur student_user_id).
 * À la place, le user_id reste en DB mais auth.users.email est mis à un
 * placeholder pour bloquer toute re-connection avec le même compte.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 });
  }

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason =
    typeof body.reason === "string" && body.reason.length > 0
      ? body.reason.slice(0, 500)
      : null;

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ── 0. Idempotency : si déjà anonymisé, return ok sans tout refaire ──────
  const { data: existing } = await admin
    .from("anonymized_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    cookies().delete(PIN_COOKIE_NAME);
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // ── 1. Audit AVANT (au cas où étapes suivantes échouent partiellement) ───
  const role = getRole(user.app_metadata);
  await logAuditEvent({
    actorId: user.id,
    actorEmail: user.email ?? null,
    actorRole: role,
    eventType: AUDIT_EVENTS.ACCOUNT_DELETION_REQUESTED,
    details: { reason },
  });

  // ── 2. Snapshot class_ids du user (pour debug futur, pas de PII) ─────────
  let classIds: string[] = [];
  if (role === "student") {
    const { data } = await admin
      .from("class_memberships")
      .select("class_id")
      .eq("student_user_id", user.id);
    classIds = (data ?? []).map((r: { class_id: string }) => r.class_id);
  } else if (role === "teacher") {
    const { data } = await admin
      .from("classes")
      .select("id")
      .eq("teacher_id", user.id);
    classIds = (data ?? []).map((r: { id: string }) => r.id);
  }

  // ── 3. INSERT anonymized_users (mark dans le system, pas de DELETE en cascade) ──
  const { error: insertError } = await admin.from("anonymized_users").insert({
    user_id: user.id,
    reason,
    class_ids: classIds,
  });
  if (insertError) {
    return NextResponse.json(
      { ok: false, error: "Erreur lors de l'enregistrement de la suppression" },
      { status: 500 },
    );
  }

  // ── 4. Retire PII de user_profiles ───────────────────────────────────────
  await admin
    .from("user_profiles")
    .update({
      first_name: null,
      last_name: null,
      pseudo: null,
      avatar_color: null,
    })
    .eq("id", user.id);

  // ── 5. DELETE user_pin (cascade non requis — table à part) ───────────────
  await admin.from("user_pin").delete().eq("user_id", user.id);

  // ── 6. Clear app_metadata.has_pin + invalidate l'email pour bloquer re-login ──
  // On garde le row auth.users (FK événementielles cascadent → conservation)
  // mais on remplace l'email par un placeholder + désactive le user.
  const nextAppMeta: Record<string, unknown> = { ...(user.app_metadata ?? {}) };
  delete nextAppMeta.has_pin;
  nextAppMeta.deleted = true;
  nextAppMeta.deleted_at = new Date().toISOString();

  await admin.auth.admin.updateUserById(user.id, {
    email: `deleted-${user.id}@anonymized.local`,
    app_metadata: nextAppMeta,
    user_metadata: {}, // wipe user_metadata complète
    ban_duration: "876000h", // ~100 ans
  });

  // ── 7. Log audit ACCOUNT_ANONYMIZED (terminé) ────────────────────────────
  await logAuditEvent({
    actorId: user.id,
    actorRole: role,
    eventType: AUDIT_EVENTS.ACCOUNT_ANONYMIZED,
    details: { classesPreserved: classIds.length },
  });

  // ── 8. Clear PIN cookie ───────────────────────────────────────────────────
  cookies().delete(PIN_COOKIE_NAME);

  return NextResponse.json({ ok: true });
}
