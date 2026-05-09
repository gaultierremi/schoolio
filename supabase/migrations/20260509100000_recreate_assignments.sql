-- Drop legacy tables (were empty in remote DB)
DROP TABLE IF EXISTS assignment_progress CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;

-- ── assignments ───────────────────────────────────────────────────────────────

CREATE TABLE assignments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id      uuid        NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  assigned_by   uuid        NOT NULL REFERENCES auth.users(id),
  title         text        NOT NULL,
  description   text        NULL,
  resource_type text        NOT NULL CHECK (resource_type IN ('pdf', 'quiz')),
  resource_id   uuid        NOT NULL,
  due_date      timestamptz NULL,
  archived_at   timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_assignments_class_id    ON assignments(class_id);
CREATE INDEX idx_assignments_resource_id ON assignments(resource_id);

CREATE OR REPLACE FUNCTION update_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assignments_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION update_assignments_updated_at();

-- ── assignment_completions ────────────────────────────────────────────────────

CREATE TABLE assignment_completions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id     uuid        NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'in_progress', 'completed')),
  completed_at      timestamptz NULL,
  score             numeric(5,2) NULL,
  duration_seconds  integer     NULL,
  attempts_count    integer     NOT NULL DEFAULT 0,
  last_attempt_at   timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_user_id)
);

CREATE INDEX idx_completions_assignment  ON assignment_completions(assignment_id);
CREATE INDEX idx_completions_student     ON assignment_completions(student_user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE assignments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_completions ENABLE ROW LEVEL SECURITY;

-- assignments: teacher sees/manages own; student sees via class membership
CREATE POLICY "teacher_sees_own_assignments"
  ON assignments FOR SELECT
  USING (assigned_by = auth.uid());

CREATE POLICY "student_sees_class_assignments"
  ON assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM class_memberships
      WHERE class_memberships.class_id = assignments.class_id
        AND class_memberships.student_user_id = auth.uid()
        AND class_memberships.status = 'active'
    )
  );

CREATE POLICY "teacher_manages_assignments"
  ON assignments FOR ALL
  USING (assigned_by = auth.uid());

-- completions: student sees/writes own; teacher sees for their assignments
CREATE POLICY "student_manages_own_completion"
  ON assignment_completions FOR ALL
  USING (student_user_id = auth.uid());

CREATE POLICY "teacher_sees_completions"
  ON assignment_completions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assignments
      WHERE assignments.id = assignment_completions.assignment_id
        AND assignments.assigned_by = auth.uid()
    )
  );
