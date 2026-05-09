-- Pre-sampled question list for 85/15 chapter+recall quizzes
CREATE TABLE IF NOT EXISTS assignment_questions (
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES teacher_questions(id) ON DELETE CASCADE,
  is_recall     BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (assignment_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_questions_assignment ON assignment_questions(assignment_id);

-- Quiz config columns on assignments
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS questions_count      INTEGER,
  ADD COLUMN IF NOT EXISTS chapter_page_start   INTEGER,
  ADD COLUMN IF NOT EXISTS chapter_page_end     INTEGER,
  ADD COLUMN IF NOT EXISTS enable_recall        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recall_pct           INTEGER DEFAULT 15;
