-- Recrée les tables classes et class_memberships depuis zéro.
-- Les anciennes migrations (090100, 090200, 100100) sont supprimées.
-- CASCADE sur le DROP retire la FK de assignments.class_id sans supprimer la table.

DROP TABLE IF EXISTS class_students CASCADE;
DROP TABLE IF EXISTS classes CASCADE;

-- ── user_profiles : role, pseudo, auth_mode ───────────────────────────────

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS role text CHECK (role IN ('teacher', 'student')),
  ADD COLUMN IF NOT EXISTS pseudo text,
  ADD COLUMN IF NOT EXISTS auth_mode text CHECK (auth_mode IN ('full', 'light'));

-- ── classes ───────────────────────────────────────────────────────────────

CREATE TABLE classes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  level             text NULL,
  subject           text NULL,
  auth_mode         text NOT NULL DEFAULT 'full' CHECK (auth_mode IN ('full', 'light')),
  invite_code       text NOT NULL UNIQUE,
  invite_link_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  archived_at       timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_classes_teacher_id ON classes(teacher_id);

CREATE OR REPLACE FUNCTION update_classes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER classes_updated_at
  BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION update_classes_updated_at();

-- ── class_memberships ─────────────────────────────────────────────────────

CREATE TABLE class_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  UNIQUE (class_id, student_user_id)
);

CREATE INDEX idx_class_memberships_class_id ON class_memberships(class_id);
CREATE INDEX idx_class_memberships_student  ON class_memberships(student_user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE classes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_memberships ENABLE ROW LEVEL SECURITY;

-- Toutes les opérations passent par les routes API (admin client).
-- Les policies permettent au service role de bypass RLS sans les créer pour tous.

CREATE POLICY "teacher_sees_own_classes"
  ON classes FOR SELECT
  USING (teacher_id = auth.uid());

CREATE POLICY "teacher_inserts_own_classes"
  ON classes FOR INSERT
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "teacher_updates_own_classes"
  ON classes FOR UPDATE
  USING (teacher_id = auth.uid());

CREATE POLICY "teacher_deletes_own_classes"
  ON classes FOR DELETE
  USING (teacher_id = auth.uid());

CREATE POLICY "teacher_or_student_sees_memberships"
  ON class_memberships FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM classes WHERE id = class_memberships.class_id AND teacher_id = auth.uid())
    OR student_user_id = auth.uid()
  );

CREATE POLICY "teacher_manages_memberships"
  ON class_memberships FOR ALL
  USING (
    EXISTS (SELECT 1 FROM classes WHERE id = class_memberships.class_id AND teacher_id = auth.uid())
  );
