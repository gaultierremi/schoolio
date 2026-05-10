CREATE TABLE live_sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                      CHAR(6) UNIQUE NOT NULL,
  teacher_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id                 UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  class_id                  UUID NULL REFERENCES classes(id) ON DELETE SET NULL,
  current_page              INT NOT NULL DEFAULT 1,
  total_pages               INT NULL,
  started_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at                  TIMESTAMPTZ NULL,
  expected_duration_minutes INT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_live_sessions_code    ON live_sessions(code) WHERE ended_at IS NULL;
CREATE INDEX idx_live_sessions_teacher ON live_sessions(teacher_id);

ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;

-- Teacher manages their own sessions
CREATE POLICY "Teachers can manage their live sessions"
  ON live_sessions FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Anon can read active sessions for Realtime postgres_changes subscriptions
-- DETTE TECHNIQUE : scope par code de session pour réduire la surface d'attaque
CREATE POLICY "Anonymous can subscribe to active live sessions"
  ON live_sessions FOR SELECT
  TO anon
  USING (ended_at IS NULL);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE live_sessions;
