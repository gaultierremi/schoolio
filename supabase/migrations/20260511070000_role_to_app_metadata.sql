-- ============================================================================
-- Migrate user role from user_metadata (editable by user) to app_metadata
-- (only writable by service role).
--
-- WHY: middleware.ts:36-37 reads role from user_metadata. user_metadata is
-- writable by the authenticated user themselves via
-- `auth.updateUser({ data: { role: "teacher" } })`. A student could flip
-- themselves into the teacher UI tree from the browser console.
-- Audit finding H1.
--
-- Application code is updated in the same PR to read app_metadata.role.
-- This migration backfills existing rows so the new code finds a value.
-- ============================================================================

UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  COALESCE(raw_user_meta_data -> 'role', '"student"'::jsonb),
  true
)
WHERE raw_user_meta_data ? 'role'
  AND (raw_app_meta_data IS NULL OR NOT (raw_app_meta_data ? 'role'));

-- The role field is kept in user_metadata too for backward compat during the
-- rollout. A follow-up migration will remove it once we are confident no
-- caller still reads from there.
