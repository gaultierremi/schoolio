-- ============================================================================
-- Add reconnect_pin_hash column to user_profiles for light account auth.
--
-- WHY: app/api/classes/[id]/join-light/route.ts:109 currently lets anyone
-- in the class reconnect as any existing light student by guessing the
-- pseudo - no proof of possession is required. Audit finding N1
-- (CRITICAL): account takeover of every light student.
--
-- HOW: store a hash of a 6-digit reconnect PIN per light user. The PIN is
-- generated at signup, displayed once to the student, then required on
-- every subsequent reconnect.
--
-- Format of the column value:
--   "<salt_hex>:<scrypt_hash_hex>"
-- Verified via crypto.scryptSync + crypto.timingSafeEqual.
-- See lib/api/pin.ts.
--
-- Backwards compat: column is nullable. Existing accounts (created before
-- this migration) have NULL and keep the legacy reconnect-by-pseudo flow
-- until a teacher resets their PIN through the admin support tooling
-- (planned for PR 9). The route layer detects NULL and behaves accordingly.
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS reconnect_pin_hash text NULL;

COMMENT ON COLUMN user_profiles.reconnect_pin_hash IS
  'Light auth: scrypt hash of the student reconnect PIN. Format: salt_hex:hash_hex. NULL = legacy account, allows pseudo-only reconnect (to be migrated by PR 9).';
