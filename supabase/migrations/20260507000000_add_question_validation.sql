ALTER TABLE teacher_questions
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS difficulty_stars smallint CHECK (difficulty_stars BETWEEN 1 AND 3);

CREATE INDEX IF NOT EXISTS teacher_questions_validated_at_idx ON teacher_questions(validated_at);
CREATE INDEX IF NOT EXISTS teacher_questions_rejected_at_idx ON teacher_questions(rejected_at);
