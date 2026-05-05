-- Cree les devoirs assignes par les professeurs aux classes.
-- Un devoir peut etre rattache a un cours ou rester independant.

CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  questions_count integer NOT NULL DEFAULT 10,
  deadline timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title text NOT NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS questions_count integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS deadline timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_assignments_class_created_at
  ON assignments (class_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_teacher_created_at
  ON assignments (teacher_id, created_at DESC);

ALTER TABLE assignments DISABLE ROW LEVEL SECURITY;
