ALTER TABLE teacher_questions
  ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS teacher_questions_course_id_idx ON teacher_questions(course_id);
