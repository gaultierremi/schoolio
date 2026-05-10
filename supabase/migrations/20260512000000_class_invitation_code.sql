-- New invitation_code column (8-char, distinct from existing invite_code which is 6-char)
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS invitation_code      TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS invitation_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_classes_invitation_code ON classes(invitation_code);

-- Seed existing classes with unique 8-char hex codes
UPDATE classes
SET invitation_code = UPPER(SUBSTR(MD5(RANDOM()::TEXT || id::TEXT), 1, 8))
WHERE invitation_code IS NULL;

-- Auto-generate for new classes
CREATE OR REPLACE FUNCTION generate_invitation_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invitation_code IS NULL THEN
    NEW.invitation_code := UPPER(SUBSTR(MD5(RANDOM()::TEXT || NEW.id::TEXT), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS classes_set_invitation_code ON classes;
CREATE TRIGGER classes_set_invitation_code
  BEFORE INSERT ON classes
  FOR EACH ROW
  EXECUTE FUNCTION generate_invitation_code();
