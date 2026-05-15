-- Sprint 0 — Add is_active boolean to teacher_questions for the curation toggle UI.
--
-- Prepares Sprint 2 simplification : replace the derived multi-state model
-- (validated_at / rejected_at / is_ai_generated → draft/pending/validated/rejected)
-- by a simple on/off slider. The validated_at / rejected_at columns stay for
-- now and will be deprecated in Sprint 2 once the UI is migrated.
--
-- Decision : 2026-05-15 (mémoire project_curation_concept_view).

BEGIN;

-- 1) Add the column with safe default (false = inactive).
ALTER TABLE public.teacher_questions
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) Backfill : every question already validated by the teacher becomes
--    is_active = TRUE. Drafts, pending, and rejected questions stay inactive.
UPDATE public.teacher_questions
   SET is_active = TRUE
 WHERE validated_at IS NOT NULL
   AND rejected_at IS NULL;

-- 3) Partial index for the common filter "active questions" (small index,
--    skips the long tail of inactive questions).
CREATE INDEX IF NOT EXISTS teacher_questions_is_active_idx
  ON public.teacher_questions (is_active)
  WHERE is_active = TRUE;

COMMENT ON COLUMN public.teacher_questions.is_active IS
  'Sprint 0 toggle replacing the legacy validated_at/rejected_at state machine. Sprint 2 will migrate the UI to use this exclusively.';

COMMIT;
