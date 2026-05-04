-- Ajoute un indicateur pour distinguer les questions generees par IA des questions validees par les profs/admins.
ALTER TABLE quiz_questions
ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quiz_questions_is_ai_generated
ON quiz_questions (is_ai_generated);
