-- Structure les concepts par matière normalisée et niveau scolaire.
-- L'objectif est de permettre des filtres cohérents sans supprimer ni modifier les données existantes.

ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS subject_enum school_subject DEFAULT 'histoire' NOT NULL,
  ADD COLUMN IF NOT EXISTS level SMALLINT,
  ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT false NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'concepts_level_check'
  ) THEN
    ALTER TABLE concepts
      ADD CONSTRAINT concepts_level_check
      CHECK (level IS NULL OR level BETWEEN 1 AND 6);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_concepts_subject_enum_level
  ON concepts (subject_enum, level);

UPDATE concepts
SET subject_enum = 'histoire'::school_subject
WHERE subject IN ('histoire') OR subject IS NULL;

UPDATE concepts
SET subject_enum = 'autre'::school_subject
WHERE subject NOT IN (
  'histoire',
  'chimie',
  'physique',
  'biologie',
  'mathematiques',
  'francais',
  'anglais',
  'neerlandais',
  'geographie',
  'autre'
)
AND subject IS NOT NULL;

UPDATE concepts
SET subject_enum = subject::school_subject
WHERE subject IN (
  'chimie',
  'physique',
  'biologie',
  'mathematiques',
  'francais',
  'anglais',
  'neerlandais',
  'geographie',
  'autre'
);
