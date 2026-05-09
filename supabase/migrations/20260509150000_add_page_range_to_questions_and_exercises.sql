ALTER TABLE teacher_questions
  ADD COLUMN IF NOT EXISTS page_range_start smallint NULL,
  ADD COLUMN IF NOT EXISTS page_range_end   smallint NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teacher_questions_page_range_valid'
      AND conrelid = 'public.teacher_questions'::regclass
  ) THEN
    ALTER TABLE teacher_questions
      ADD CONSTRAINT teacher_questions_page_range_valid CHECK (
        (page_range_start IS NULL AND page_range_end IS NULL)
        OR (page_range_start IS NOT NULL AND page_range_end IS NOT NULL
            AND page_range_start >= 1
            AND page_range_end >= page_range_start)
      );
  END IF;
END $$;

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS page_range_start smallint NULL,
  ADD COLUMN IF NOT EXISTS page_range_end   smallint NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exercises_page_range_valid'
      AND conrelid = 'public.exercises'::regclass
  ) THEN
    ALTER TABLE exercises
      ADD CONSTRAINT exercises_page_range_valid CHECK (
        (page_range_start IS NULL AND page_range_end IS NULL)
        OR (page_range_start IS NOT NULL AND page_range_end IS NOT NULL
            AND page_range_start >= 1
            AND page_range_end >= page_range_start)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_teacher_questions_page_range
  ON teacher_questions (course_id, page_range_start, page_range_end);

CREATE INDEX IF NOT EXISTS idx_exercises_page_range
  ON exercises (course_id, page_range_start, page_range_end);
