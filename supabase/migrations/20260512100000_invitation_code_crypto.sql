-- ============================================================================
-- Replace the invitation_code generation trigger with a crypto-strong source.
--
-- WHY: 20260512000000_class_invitation_code.sql:16-25 used MD5(RANDOM())
-- to seed the 8-char invitation code. Postgres RANDOM() is a deterministic
-- LCG seeded per session (NOT cryptographically secure) — codes were
-- predictable to anyone who could observe a few outputs.
--
-- Combined with /api/join/preview being public and the (now-removed) auto
-- whitelist-on-join behavior, this made codes a soft credential that could
-- be enumerated rather than known.
--
-- gen_random_uuid() is built into PostgreSQL 13+ and uses the OS CSPRNG.
-- Taking 8 hex chars from the v4 UUID gives 32 bits of effective entropy.
-- That's still small enough that /api/join/preview should be rate-limited
-- (planned in a follow-up PR), but at least the codes themselves are
-- unguessable.
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_invitation_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.invitation_code IS NULL THEN
    NEW.invitation_code := UPPER(SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;
