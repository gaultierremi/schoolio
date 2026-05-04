-- Distingue les questions générées par IA des questions validées par les profs ou admins.

ALTER TABLE quiz_questions
  ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quiz_questions_is_ai_generated
  ON quiz_questions (is_ai_generated);
