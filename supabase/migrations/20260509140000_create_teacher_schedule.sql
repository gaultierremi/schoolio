-- Teacher schedule slots
CREATE TABLE teacher_schedule_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  week_pattern text NOT NULL DEFAULT 'all' CHECK (week_pattern IN ('all', 'A', 'B')),
  class_id uuid NULL REFERENCES classes(id) ON DELETE SET NULL,
  subject_label text NULL,
  custom_color text NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time < end_time),
  CHECK (class_id IS NOT NULL OR subject_label IS NOT NULL)
);

CREATE INDEX idx_schedule_teacher_day ON teacher_schedule_slots (teacher_id, day_of_week);

CREATE OR REPLACE FUNCTION update_teacher_schedule_slots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER teacher_schedule_slots_updated_at
  BEFORE UPDATE ON teacher_schedule_slots
  FOR EACH ROW EXECUTE FUNCTION update_teacher_schedule_slots_updated_at();

ALTER TABLE teacher_schedule_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teacher_select_own_slots" ON teacher_schedule_slots
  FOR SELECT USING (teacher_id = auth.uid());

CREATE POLICY "teacher_insert_own_slots" ON teacher_schedule_slots
  FOR INSERT WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "teacher_update_own_slots" ON teacher_schedule_slots
  FOR UPDATE USING (teacher_id = auth.uid());

CREATE POLICY "teacher_delete_own_slots" ON teacher_schedule_slots
  FOR DELETE USING (teacher_id = auth.uid());

-- Add schedule preferences to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS schedule_onboarding_dismissed boolean NOT NULL DEFAULT false;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS week_pattern_override text NOT NULL DEFAULT 'auto'
  CHECK (week_pattern_override IN ('auto', 'force_A', 'force_B'));
