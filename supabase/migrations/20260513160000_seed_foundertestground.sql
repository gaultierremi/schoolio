-- Sprint 0 — T7: Seed FounderTestGround tenant + backfill + NOT NULL.
-- Note: timestamp adjusted to 160000 (not 150000) — that slot is taken by
-- 20260513150000_add_listening_active_to_live_sessions.sql.

BEGIN;

-- Insert FounderTestGround (idempotent — slug is UNIQUE).
INSERT INTO public.schools (id, name, slug, country, region, metadata)
VALUES (
  '00000000-0000-0000-0000-000000000001'::UUID,
  'FounderTestGround',
  'founder-testground',
  'BE',
  'Wallonie-Bruxelles',
  '{"type": "internal_testing", "description": "Initial founders testing tenant"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Backfill all existing rows to FounderTestGround.
UPDATE public.user_profiles
  SET school_id = '00000000-0000-0000-0000-000000000001'::UUID
  WHERE school_id IS NULL;
UPDATE public.classes
  SET school_id = '00000000-0000-0000-0000-000000000001'::UUID
  WHERE school_id IS NULL;
UPDATE public.courses
  SET school_id = '00000000-0000-0000-0000-000000000001'::UUID
  WHERE school_id IS NULL;
UPDATE public.teacher_questions
  SET school_id = '00000000-0000-0000-0000-000000000001'::UUID
  WHERE school_id IS NULL;
UPDATE public.assignments
  SET school_id = '00000000-0000-0000-0000-000000000001'::UUID
  WHERE school_id IS NULL;
UPDATE public.live_sessions
  SET school_id = '00000000-0000-0000-0000-000000000001'::UUID
  WHERE school_id IS NULL;
UPDATE public.teacher_schedule_slots
  SET school_id = '00000000-0000-0000-0000-000000000001'::UUID
  WHERE school_id IS NULL;
UPDATE public.teacher_organization_tags
  SET school_id = '00000000-0000-0000-0000-000000000001'::UUID
  WHERE school_id IS NULL;

-- Now enforce NOT NULL — every row must belong to a tenant.
ALTER TABLE public.user_profiles ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.classes ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.courses ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.teacher_questions ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.assignments ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.live_sessions ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.teacher_schedule_slots ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.teacher_organization_tags ALTER COLUMN school_id SET NOT NULL;

COMMIT;
