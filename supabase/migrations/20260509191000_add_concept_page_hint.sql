-- Pointer to the theory page in the PDF that explains the concept tested by a question
ALTER TABLE teacher_questions
  ADD COLUMN IF NOT EXISTS concept_page_hint smallint NULL;
