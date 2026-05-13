-- Sprint 0.5 — Drop live_sessions + related tables (out of MVP scope per spec §2.2)
--
-- Schoolio shipped live sessions (teacher projects questions in real-time,
-- students answer, random pick of a student to answer). Maïa replaces this
-- with the post-session loop (Sprint 6) — async, lower cognitive load, no
-- live cursor, no live AI runtime required (spec §1, §4.3).
--
-- Drop order respects FK constraints: child tables before parent.

BEGIN;

-- 1. Drop RPC that queries live_sessions (must go before table drop)
DROP FUNCTION IF EXISTS public.get_live_session_by_code(TEXT);

-- 2. Drop tables in FK-safe order (children first)
--    live_question_answers → live_sessions (CASCADE would handle it, but
--    explicit is cleaner and documents intent)
DROP TABLE IF EXISTS public.live_question_answers CASCADE;
DROP TABLE IF EXISTS public.student_random_picks CASCADE;
DROP TABLE IF EXISTS public.live_sessions CASCADE;

-- 3. Update teacher_questions.origin CHECK constraint to remove 'ai_live'.
--    The 17 existing rows with origin = 'ai_live' are kept as-is — they are
--    valid questions, just orphaned from a deleted feature. The constraint is
--    relaxed so existing data is not invalidated; new code no longer produces
--    this origin value.
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.teacher_questions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%origin%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.teacher_questions DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

-- Re-add constraint without 'ai_live' (keep 'ai_listen' for existing rows
-- from the earlier listen feature, also removed in Sprint 0 T11)
ALTER TABLE public.teacher_questions
  ADD CONSTRAINT teacher_questions_origin_check
  CHECK (origin IN ('ai_generated', 'extracted_from_pdf', 'ai_live', 'ai_listen'));

-- NOTE: We intentionally keep 'ai_live' and 'ai_listen' as allowed values in
-- the CHECK constraint so that existing rows (17 ai_live, 0 ai_listen) remain
-- valid. No new code will produce these values. A future data-cleanup migration
-- can UPDATE those rows to 'ai_generated' and then tighten the constraint.

COMMIT;
