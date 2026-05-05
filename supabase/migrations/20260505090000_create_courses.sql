-- Cree la bibliotheque de cours des professeurs.
-- Ces fondations permettront de rattacher des PDF, matieres et niveaux aux cours.

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject_enum school_subject NOT NULL DEFAULT 'autre',
  level smallint,
  chapter_number integer,
  description text,
  pdf_storage_path text,
  pdf_hash text,
  pdf_size_bytes bigint,
  pages_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS title text NOT NULL,
  ADD COLUMN IF NOT EXISTS subject_enum school_subject NOT NULL DEFAULT 'autre',
  ADD COLUMN IF NOT EXISTS level smallint,
  ADD COLUMN IF NOT EXISTS chapter_number integer,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text,
  ADD COLUMN IF NOT EXISTS pdf_hash text,
  ADD COLUMN IF NOT EXISTS pdf_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS pages_count integer,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'courses_level_check'
      AND conrelid = 'public.courses'::regclass
  ) THEN
    ALTER TABLE courses
      ADD CONSTRAINT courses_level_check
      CHECK (level IS NULL OR level BETWEEN 1 AND 6);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_courses_teacher_subject_level
  ON courses (teacher_id, subject_enum, level);

CREATE INDEX IF NOT EXISTS idx_courses_pdf_hash
  ON courses (pdf_hash);

ALTER TABLE courses DISABLE ROW LEVEL SECURITY;
