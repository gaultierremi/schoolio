-- ============================================================================
-- Append-only audit_log table for legally-defensible trails.
--
-- WHY: the existing `activity_events` table is a UI feed (low integrity
-- guarantees, narrow event coverage). For a B2B école product, we need a
-- separate, tamper-proof log that can support:
--   - RGPD Art 30 (Register of Processing Activities) lookups
--   - school disputes ("did Léa actually open this assignment at 14:32?")
--   - incident-response forensics
--   - admin accountability (impersonation traces, see PR 9 future)
--
-- Design choices:
--   - bigserial id (compact, monotonic; no UUID overhead).
--   - actor_id may be NULL (system events, deleted users) but actor_role is
--     always present.
--   - actor_email is frozen at write-time (not a join) so that even if the
--     auth.users row is later deleted, the audit row remains meaningful.
--   - INSERT-only at the policy level (WITH CHECK false).
--     UPDATE and DELETE are blocked by triggers that raise an exception.
--     Service role cannot bypass the triggers (triggers fire for everyone).
--   - SELECT is denied via RLS to anon/authenticated. Service role reads
--     directly for support tooling.
--
-- For RGPD right-to-erasure: regulatory retention obligations on school
-- records (Belgian secondary education) typically override the right to
-- erasure for audit data. If a redaction is ever required, it must be done
-- via a controlled SECURITY DEFINER function that enforces a justification
-- and writes an erasure event to audit_log itself. NOT via direct UPDATE.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id           bigserial    PRIMARY KEY,
  occurred_at  timestamptz  NOT NULL DEFAULT now(),
  actor_id     uuid         NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email  text         NULL,
  actor_role   text         NOT NULL CHECK (actor_role IN ('student', 'teacher', 'school_admin', 'super_admin', 'system')),
  event_type   text         NOT NULL,
  target_type  text         NULL,
  target_id    text         NULL,
  details      jsonb        NOT NULL DEFAULT '{}'::jsonb,
  ip_address   inet         NULL,
  user_agent   text         NULL
);

CREATE INDEX IF NOT EXISTS audit_log_occurred_at_idx ON audit_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx    ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS audit_log_event_type_idx  ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS audit_log_target_idx      ON audit_log(target_type, target_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Block UPDATE and DELETE entirely - audit_log is append-only.
-- Service role does NOT bypass triggers, so this enforces immutability for
-- everyone. Even a compromised admin client cannot rewrite history.
CREATE OR REPLACE FUNCTION block_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is forbidden', TG_OP;
END;
$$;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION block_audit_log_mutation();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION block_audit_log_mutation();

-- Anon/authenticated cannot INSERT or SELECT. Service role bypasses RLS for
-- both. Application code (a future lib/audit/log.ts helper) writes via the
-- service-role admin client; SELECT happens through purpose-built read paths
-- (super-admin only).
CREATE POLICY "no_user_inserts" ON audit_log
  FOR INSERT WITH CHECK (false);

CREATE POLICY "no_user_selects" ON audit_log
  FOR SELECT USING (false);
