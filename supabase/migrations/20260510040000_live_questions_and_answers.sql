-- Extend origin CHECK on teacher_questions to include 'ai_live' (generated during a live session)
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'teacher_questions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%origin%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE teacher_questions DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE teacher_questions
  ADD CONSTRAINT teacher_questions_origin_check
  CHECK (origin IN ('ai_generated', 'extracted_from_pdf', 'ai_live'));

-- Add question projection state to live_sessions
ALTER TABLE live_sessions
  ADD COLUMN projected_question_id UUID NULL REFERENCES teacher_questions(id) ON DELETE SET NULL,
  ADD COLUMN show_answer           BOOLEAN NOT NULL DEFAULT false;

-- Track student answers during a live session
CREATE TABLE live_question_answers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id     UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  question_id         UUID NOT NULL REFERENCES teacher_questions(id) ON DELETE CASCADE,
  student_user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answer_index        INT NOT NULL,
  is_correct          BOOLEAN NOT NULL,
  answered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (live_session_id, question_id, student_user_id)
);

CREATE INDEX idx_lqa_session_question ON live_question_answers(live_session_id, question_id);
CREATE INDEX idx_lqa_student         ON live_question_answers(student_user_id);

ALTER TABLE live_question_answers ENABLE ROW LEVEL SECURITY;

-- Teacher reads answers for their sessions
CREATE POLICY "Teachers read answers for their sessions"
  ON live_question_answers FOR SELECT
  USING (
    live_session_id IN (
      SELECT id FROM live_sessions WHERE teacher_id = auth.uid()
    )
  );

-- Students insert and read their own answers
CREATE POLICY "Students insert their own answers"
  ON live_question_answers FOR INSERT
  WITH CHECK (student_user_id = auth.uid());

CREATE POLICY "Students read their own answers"
  ON live_question_answers FOR SELECT
  USING (student_user_id = auth.uid());

-- Enable Realtime so teacher cockpit receives live answer counts
ALTER PUBLICATION supabase_realtime ADD TABLE live_question_answers;
