-- Add origin column to teacher_questions to distinguish AI-generated vs extracted-from-PDF questions
ALTER TABLE teacher_questions
  ADD COLUMN IF NOT EXISTS origin TEXT CHECK (origin IN ('ai_generated', 'extracted_from_pdf'));
