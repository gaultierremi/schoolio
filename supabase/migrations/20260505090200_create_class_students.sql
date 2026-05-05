-- Cree la liaison entre les classes et les eleves.
-- La colonne removed_at permet de retirer un eleve sans perdre l'historique.

CREATE TABLE IF NOT EXISTS class_students (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  PRIMARY KEY (class_id, student_id)
);

ALTER TABLE class_students
  ADD COLUMN IF NOT EXISTS class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_class_students_student_id
  ON class_students (student_id);

CREATE INDEX IF NOT EXISTS idx_class_students_class_active
  ON class_students (class_id)
  WHERE removed_at IS NULL;

ALTER TABLE class_students DISABLE ROW LEVEL SECURITY;
