-- Sprint 0.5 — Drop Schoolio skin-system columns on user_profiles
-- Maïa gamification = per-subject progression % only (mockup-aligned, spec §2.2).
-- No badges, no medals, no skins, no unlocks.
-- xp and level columns are KEPT pending Sprint 4 (may be reused).
--
-- Audit (2026-05-13): skin-related columns found were:
--   unlocked_skins (jsonb)
--   active_skin    (text)
-- No skin_id column existed in production.

BEGIN;

ALTER TABLE public.user_profiles
  DROP COLUMN IF EXISTS unlocked_skins,
  DROP COLUMN IF EXISTS active_skin;

COMMIT;
