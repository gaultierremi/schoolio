-- ── exercises ─────────────────────────────────────────────────────────────────

CREATE TABLE exercises (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id           uuid        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id          uuid        NOT NULL REFERENCES auth.users(id),
  title               text        NOT NULL,
  statement           text        NOT NULL,
  exercise_type       text        NULL,
  subject_enum        text        NULL,
  level               smallint    NULL,
  difficulty          smallint    NULL CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 3),
  status              text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'validated', 'rejected', 'archived')),
  validated_at        timestamptz NULL,
  rejected_at         timestamptz NULL,
  validated_by        uuid        NULL REFERENCES auth.users(id),
  generated_by_model  text        NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_exercises_course_id  ON exercises(course_id);
CREATE INDEX idx_exercises_teacher_id ON exercises(teacher_id);
CREATE INDEX idx_exercises_status     ON exercises(status);

CREATE OR REPLACE FUNCTION update_exercises_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exercises_updated_at
  BEFORE UPDATE ON exercises
  FOR EACH ROW EXECUTE FUNCTION update_exercises_updated_at();

-- ── exercise_steps ────────────────────────────────────────────────────────────

CREATE TABLE exercise_steps (
  id                uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id       uuid      NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  step_number       smallint  NOT NULL,
  title             text      NULL,
  content           text      NOT NULL,
  method_or_concept text      NULL,
  is_final_answer   boolean   NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exercise_id, step_number)
);

CREATE INDEX idx_exercise_steps_exercise_id ON exercise_steps(exercise_id);

-- ── RLS (teacher only pour cette session) ─────────────────────────────────────

ALTER TABLE exercises      ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teacher_manages_exercises"
  ON exercises FOR ALL
  USING (teacher_id = auth.uid());

CREATE POLICY "teacher_manages_exercise_steps"
  ON exercise_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM exercises
      WHERE exercises.id = exercise_steps.exercise_id
        AND exercises.teacher_id = auth.uid()
    )
  );
