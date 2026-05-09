-- Per-question answer tracking for assignment quizzes
CREATE TABLE IF NOT EXISTS assignment_question_answers (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id         uuid        NOT NULL REFERENCES assignments(id)       ON DELETE CASCADE,
  student_user_id       uuid        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  question_id           uuid        NOT NULL REFERENCES teacher_questions(id) ON DELETE CASCADE,
  is_correct            bool        NOT NULL,
  requested_solution    bool        NOT NULL DEFAULT false,
  requested_explanation bool        NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aqa_assignment ON assignment_question_answers(assignment_id);
CREATE INDEX IF NOT EXISTS idx_aqa_student    ON assignment_question_answers(student_user_id);
CREATE INDEX IF NOT EXISTS idx_aqa_question   ON assignment_question_answers(question_id);

ALTER TABLE assignment_question_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_manages_own_answers"
  ON assignment_question_answers FOR ALL
  USING (student_user_id = auth.uid());

CREATE POLICY "teacher_sees_assignment_answers"
  ON assignment_question_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assignments
      WHERE assignments.id = assignment_question_answers.assignment_id
        AND assignments.assigned_by = auth.uid()
    )
  );

-- Extend assignment_completions with engagement tracking fields
ALTER TABLE assignment_completions
  ADD COLUMN IF NOT EXISTS requested_solution        bool NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requested_explanation     bool NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bonus_questions_completed int  NOT NULL DEFAULT 0;
