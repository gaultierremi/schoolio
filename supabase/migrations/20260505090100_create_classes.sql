-- Cree les classes des professeurs.
-- Ces fondations permettront aux eleves de rejoindre une classe avec un code.

CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject_enum school_subject NOT NULL DEFAULT 'autre',
  level smallint NOT NULL,
  school_year text,
  invite_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name text NOT NULL,
  ADD COLUMN IF NOT EXISTS subject_enum school_subject NOT NULL DEFAULT 'autre',
  ADD COLUMN IF NOT EXISTS level smallint NOT NULL,
  ADD COLUMN IF NOT EXISTS school_year text,
  ADD COLUMN IF NOT EXISTS invite_code text NOT NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'classes_level_check'
      AND conrelid = 'public.classes'::regclass
  ) THEN
    ALTER TABLE classes
      ADD CONSTRAINT classes_level_check
      CHECK (level BETWEEN 1 AND 6);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_classes_teacher_active
  ON classes (teacher_id)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_invite_code
  ON classes (invite_code);

ALTER TABLE classes DISABLE ROW LEVEL SECURITY;
