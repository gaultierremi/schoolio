CREATE TABLE IF NOT EXISTS teacher_organization_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text,
  color text NOT NULL DEFAULT 'purple' CHECK (color IN ('purple', 'blue', 'red', 'orange', 'green', 'yellow', 'pink', 'gray')),
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teacher_organization_tags_teacher_id_idx ON teacher_organization_tags(teacher_id);
CREATE UNIQUE INDEX IF NOT EXISTS teacher_organization_tags_teacher_name_unique ON teacher_organization_tags(teacher_id, name);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_teacher_organization_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER teacher_organization_tags_updated_at_trigger
BEFORE UPDATE ON teacher_organization_tags
FOR EACH ROW
EXECUTE FUNCTION update_teacher_organization_tags_updated_at();

-- Ajout colonnes organization_tags sur courses et teacher_questions
ALTER TABLE courses ADD COLUMN IF NOT EXISTS organization_tags uuid[] DEFAULT ARRAY[]::uuid[];
ALTER TABLE teacher_questions ADD COLUMN IF NOT EXISTS organization_tags uuid[] DEFAULT ARRAY[]::uuid[];

CREATE INDEX IF NOT EXISTS courses_organization_tags_idx ON courses USING GIN (organization_tags);
CREATE INDEX IF NOT EXISTS teacher_questions_organization_tags_idx ON teacher_questions USING GIN (organization_tags);

-- RLS : pas de policy publique. Toutes les opérations passent par routes API admin.
ALTER TABLE teacher_organization_tags ENABLE ROW LEVEL SECURITY;
