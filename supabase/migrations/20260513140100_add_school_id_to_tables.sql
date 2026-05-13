-- Sprint 0 — T5: Add nullable school_id FK to 8 core tables.
-- Nullable initially so existing rows survive; T7 backfills + adds NOT NULL.

BEGIN;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT;
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT;
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT;
ALTER TABLE public.teacher_questions
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT;
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT;
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT;
ALTER TABLE public.teacher_schedule_slots
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT;
ALTER TABLE public.teacher_organization_tags
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_user_profiles_school_id ON public.user_profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON public.classes(school_id);
CREATE INDEX IF NOT EXISTS idx_courses_school_id ON public.courses(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_questions_school_id ON public.teacher_questions(school_id);
CREATE INDEX IF NOT EXISTS idx_assignments_school_id ON public.assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_school_id ON public.live_sessions(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_schedule_slots_school_id ON public.teacher_schedule_slots(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_organization_tags_school_id ON public.teacher_organization_tags(school_id);

COMMIT;
