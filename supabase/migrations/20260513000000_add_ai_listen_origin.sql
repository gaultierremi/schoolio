-- Extend the CHECK constraint on teacher_questions.origin to include
-- 'ai_live' (already used in code but missing from constraint) and 'ai_listen' (new).
ALTER TABLE teacher_questions DROP CONSTRAINT IF EXISTS teacher_questions_origin_check;
ALTER TABLE teacher_questions
  ADD CONSTRAINT teacher_questions_origin_check
  CHECK (origin IN ('ai_generated', 'extracted_from_pdf', 'ai_live', 'ai_listen'));
