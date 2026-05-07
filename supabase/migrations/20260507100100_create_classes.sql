CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  level smallint CHECK (level BETWEEN 1 AND 6),
  subjects text[] DEFAULT ARRAY[]::text[],
  organization_tags uuid[] DEFAULT ARRAY[]::uuid[],
  invitation_code text NOT NULL UNIQUE,
  include_generic_courses boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classes_teacher_id_idx ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS classes_invitation_code_idx ON classes(invitation_code);
CREATE INDEX IF NOT EXISTS classes_organization_tags_idx ON classes USING GIN (organization_tags);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_classes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER classes_updated_at_trigger
BEFORE UPDATE ON classes
FOR EACH ROW
EXECUTE FUNCTION update_classes_updated_at();

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
