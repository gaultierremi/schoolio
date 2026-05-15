import { createClient } from "@supabase/supabase-js";

/**
 * Audit log helper (Sprint 1A) — append-only writer pour la table audit_log
 * (créée par migration 20260511050000_audit_log_immutable.sql, RLS strict).
 *
 * Fire-and-forget : les erreurs sont catchées et loguées en console mais
 * jamais propagées (un log audit qui échoue ne doit pas casser une action
 * fonctionnelle comme un login PIN). Le rôle audit_log est de tracer ce
 * qu'on peut, pas de bloquer.
 *
 * Toutes les écritures passent par le service role client (jamais via le
 * client browser-side) car la table a RLS strict.
 */

/**
 * Canonical event types. Aligné avec mémoire `project_pin_auth_spec` +
 * Sprint 1A spec. La table audit_log accepte n'importe quel text en
 * event_type, mais on garde les valeurs ici pour éviter les typos.
 */
export const AUDIT_EVENTS = {
  SSO_LOGIN: "sso_login",
  PIN_SETUP: "pin_setup",
  PIN_SUCCESS: "pin_success",
  PIN_FAILURE: "pin_failure",
  PIN_LOCKOUT: "pin_lockout",
  PIN_RESET: "pin_reset",
  CONSENT_GIVEN: "consent_given",
  CONSENT_REVOKED: "consent_revoked",
  DATA_EXPORT_REQUESTED: "data_export_requested",
  ACCOUNT_DELETION_REQUESTED: "account_deletion_requested",
  ACCOUNT_ANONYMIZED: "account_anonymized",
} as const;

export type AuditEventType = (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];

type AuditActorRole = "student" | "teacher" | "school_admin" | "super_admin" | "system";

type LogAuditEventParams = {
  actorId: string;
  actorRole: AuditActorRole;
  eventType: AuditEventType | string;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Insère un événement dans `audit_log`. Jamais d'exception propagée.
 *
 * Usage :
 *   await logAuditEvent({
 *     actorId: user.id,
 *     actorRole: "student",
 *     eventType: AUDIT_EVENTS.PIN_SUCCESS,
 *     details: { failedAttemptsBefore: 1 },
 *   });
 */
export async function logAuditEvent(params: LogAuditEventParams): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_log").insert({
      actor_id: params.actorId,
      actor_email: params.actorEmail ?? null,
      actor_role: params.actorRole,
      event_type: params.eventType,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      details: params.details ?? {},
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[audit_log] insert failed:", error.message, {
        eventType: params.eventType,
        actorId: params.actorId,
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[audit_log] unexpected error:",
      err instanceof Error ? err.message : String(err),
      { eventType: params.eventType, actorId: params.actorId },
    );
  }
}
