-- Cree le suivi d'avancement des eleves sur les devoirs.
-- Ces donnees permettront aux professeurs de suivre completion, score et reussite.

CREATE TABLE IF NOT EXISTS assignment_progress (
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz,
  completed_at timestamptz,
  questions_answered integer NOT NULL DEFAULT 0,
  correct_answers integer NOT NULL DEFAULT 0,
  score numeric(5,2),
  PRIMARY KEY (assignment_id, student_id)
);

ALTER TABLE assignment_progress
  ADD COLUMN IF NOT EXISTS assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS questions_answered integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_answers integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score numeric(5,2);

CREATE INDEX IF NOT EXISTS idx_assignment_progress_student_completed_at
  ON assignment_progress (student_id, completed_at);

CREATE INDEX IF NOT EXISTS idx_assignment_progress_assignment_completed_at
  ON assignment_progress (assignment_id, completed_at);

ALTER TABLE assignment_progress DISABLE ROW LEVEL SECURITY;
