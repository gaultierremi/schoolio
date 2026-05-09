CREATE TABLE class_attendance_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  period          INT NULL,
  status          TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')),
  notes           TEXT NULL,
  recorded_by     UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, student_user_id, date, period)
);

CREATE INDEX idx_attendance_class_date ON class_attendance_records(class_id, date);
CREATE INDEX idx_attendance_student    ON class_attendance_records(student_user_id);

ALTER TABLE class_attendance_records ENABLE ROW LEVEL SECURITY;

-- Teachers manage attendance for their own classes
CREATE POLICY "Teachers can manage attendance for their classes"
  ON class_attendance_records FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id         = class_attendance_records.class_id
        AND c.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id         = class_attendance_records.class_id
        AND c.teacher_id = auth.uid()
    )
  );

-- Students can read their own attendance records
CREATE POLICY "Students can view their own attendance"
  ON class_attendance_records FOR SELECT
  USING (student_user_id = auth.uid());
