-- Sprint 0.5 — Cleanup teacher_questions.origin enum after live + listen feature removal
--
-- Sprint 0 T11 removed Schoolio Listen.
-- Sprint 0.5 T7 removed live sessions.
-- Both leave dead enum values on teacher_questions.origin :
--   - 'ai_live'   : 17 rows in prod (generated during live sessions)
--   - 'ai_listen' : 0 rows in prod (the listen feature was removed before any
--                                   question was generated through it)
--
-- This migration :
--   1. Re-tags the 17 'ai_live' rows as 'ai_generated' — they were AI-produced,
--      just delivered via the (now-removed) live channel. The underlying questions
--      are valid teaching material and the prof can keep using them.
--   2. Tightens the CHECK constraint to permit only the values that remain
--      meaningful in Maïa : 'ai_generated' (from the Sprint 1 ingestion pipeline)
--      and 'extracted_from_pdf' (verbatim from the curated syllabus).
--
-- 225 rows with origin = NULL are unaffected (NULL doesn't violate the CHECK).

BEGIN;

-- Step 1: migrate ai_live → ai_generated
UPDATE public.teacher_questions
SET origin = 'ai_generated'
WHERE origin = 'ai_live';

-- Step 2: drop the old CHECK constraint
ALTER TABLE public.teacher_questions
  DROP CONSTRAINT IF EXISTS teacher_questions_origin_check;

-- Step 3: add the tightened CHECK constraint
ALTER TABLE public.teacher_questions
  ADD CONSTRAINT teacher_questions_origin_check
  CHECK (origin = ANY (ARRAY['ai_generated'::text, 'extracted_from_pdf'::text]));

COMMIT;
