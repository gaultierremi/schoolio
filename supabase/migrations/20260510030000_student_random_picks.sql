CREATE TABLE student_random_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  picked_by UUID NOT NULL REFERENCES auth.users(id),
  picked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  live_session_id UUID NULL REFERENCES live_sessions(id) ON DELETE SET NULL,
  was_cancelled BOOLEAN NOT NULL DEFAULT false,
  context TEXT NULL
);

CREATE INDEX idx_picks_class_student ON student_random_picks(class_id, student_user_id);
CREATE INDEX idx_picks_picked_at ON student_random_picks(picked_at DESC);

-- RLS
ALTER TABLE student_random_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage picks for their classes"
  ON student_random_picks FOR ALL
  USING (class_id IN (SELECT id FROM classes WHERE teacher_id = auth.uid()))
  WITH CHECK (class_id IN (SELECT id FROM classes WHERE teacher_id = auth.uid()));

CREATE POLICY "Students see their own picks"
  ON student_random_picks FOR SELECT
  USING (student_user_id = auth.uid());
