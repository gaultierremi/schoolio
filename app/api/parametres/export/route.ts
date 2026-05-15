import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";

export const runtime = "nodejs";

function getRole(appMeta: unknown): "student" | "teacher" | "system" {
  const role = (appMeta as Record<string, unknown>)?.role;
  if (role === "student" || role === "teacher") return role;
  return "system";
}

/**
 * GET /api/parametres/export
 *
 * Sprint 1B — RGPD Art. 20 droit à la portabilité.
 *
 * Aggregate via service role les données du user authentifié + retourne
 * un fichier JSON téléchargeable (Content-Disposition: attachment).
 *
 * Performance : pour MVP, on génère synchroniquement. Si > 5000 réponses,
 * le post-MVP basculera vers job async + email avec lien temporaire.
 *
 * Sécurité : on n'inclut pas les pin_hash, ip_hash, signature_token_hash —
 * ces valeurs hashées n'ont aucune utilité pour le user qui les exporte.
 */
export async function GET() {
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

  const role = getRole(user.app_metadata);

  // Profil
  const { data: profile } = await admin
    .from("user_profiles")
    .select("id, first_name, last_name, pseudo, avatar_color, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  // Classes
  let classesData: unknown = [];
  if (role === "student") {
    const { data } = await admin
      .from("class_memberships")
      .select("class_id, status, joined_at, classes(id, name, subject, level)")
      .eq("student_user_id", user.id);
    classesData = data ?? [];
  } else if (role === "teacher") {
    const { data } = await admin
      .from("classes")
      .select("id, name, subject, level, created_at, archived_at")
      .eq("teacher_id", user.id);
    classesData = data ?? [];
  }

  // Réponses aux quiz / devoirs (élève uniquement)
  let answersData: unknown = [];
  if (role === "student") {
    const { data } = await admin
      .from("assignment_question_answers")
      .select("assignment_id, question_id, is_correct, answer_value, created_at")
      .eq("student_user_id", user.id)
      .limit(10000); // safety cap
    answersData = data ?? [];
  }

  // Mastery par concept (élève uniquement, si la table existe)
  let masteryData: unknown = [];
  if (role === "student") {
    try {
      const { data } = await admin
        .from("user_concept_mastery")
        .select("concept_id, mastery_score, attempts, correct, last_seen_at")
        .eq("user_id", user.id);
      masteryData = data ?? [];
    } catch {
      // Table peut ne pas exister selon migration — silent ignore
    }
  }

  // Consentements
  const { data: consents } = await admin
    .from("consent_records")
    .select("id, signed_at, revoked_at, created_at, parent_email_hash, expires_at")
    .eq("student_user_id", user.id)
    .order("created_at", { ascending: false });

  // Mark dans le payload : on dit juste si parent_email_hash IS NOT NULL
  // (sans le hash lui-même qui n'a pas de valeur user-side)
  const consentsExport = (consents ?? []).map((c: {
    id: string;
    signed_at: string | null;
    revoked_at: string | null;
    created_at: string;
    parent_email_hash: string | null;
    expires_at: string;
  }) => ({
    id: c.id,
    signed_at: c.signed_at,
    revoked_at: c.revoked_at,
    created_at: c.created_at,
    expires_at: c.expires_at,
    via_parent: !!c.parent_email_hash,
  }));

  // Audit log (filtré aux events pertinents pour le user)
  const { data: auditEntries } = await admin
    .from("audit_log")
    .select("id, occurred_at, event_type, details")
    .eq("actor_id", user.id)
    .in("event_type", [
      "sso_login",
      "pin_setup",
      "pin_success",
      "pin_failure",
      "pin_lockout",
      "pin_reset",
      "consent_given",
      "consent_revoked",
      "data_export_requested",
      "account_deletion_requested",
    ])
    .order("occurred_at", { ascending: false })
    .limit(500);

  // PIN row meta (sans hash) — utile pour transparence
  const { data: pinRow } = await admin
    .from("user_pin")
    .select("user_timezone, last_unlock_at, created_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  // ── Log audit AVANT retour pour que l'export apparaisse dans le journal ─
  await logAuditEvent({
    actorId: user.id,
    actorEmail: user.email ?? null,
    actorRole: role,
    eventType: AUDIT_EVENTS.DATA_EXPORT_REQUESTED,
  });

  // ── Build le payload final ──────────────────────────────────────────────
  const payload = {
    meta: {
      export_generated_at: new Date().toISOString(),
      maia_version: "Sprint 1B",
      rgpd_article: "Art. 20 RGPD droit à la portabilité",
      user_id: user.id,
      email: user.email,
      role,
    },
    profile: profile ?? null,
    pin_meta: pinRow ?? null,
    classes: classesData,
    quiz_answers: answersData,
    mastery: masteryData,
    consents: consentsExport,
    activity_log: auditEntries ?? [],
  };

  const today = new Date().toISOString().slice(0, 10);
  const json = JSON.stringify(payload, null, 2);

  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="maia-export-${today}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
