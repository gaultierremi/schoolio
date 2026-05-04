-- Structure les questions enseignants et quiz par matière normalisée et niveau scolaire belge.
-- L'objectif est de fiabiliser les filtres sans supprimer les champs ou données existants.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_subject') THEN
    CREATE TYPE school_subject AS ENUM (
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
    );
  END IF;
END $$;

ALTER TABLE teacher_questions
  ADD COLUMN IF NOT EXISTS subject_enum school_subject DEFAULT 'autre' NOT NULL,
  ADD COLUMN IF NOT EXISTS level SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'teacher_questions_level_check'
  ) THEN
    ALTER TABLE teacher_questions
      ADD CONSTRAINT teacher_questions_level_check
      CHECK (level IS NULL OR level BETWEEN 1 AND 6);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_teacher_questions_subject_enum_level
  ON teacher_questions (subject_enum, level);

ALTER TABLE quiz_questions
  ADD COLUMN IF NOT EXISTS subject_enum school_subject DEFAULT 'histoire' NOT NULL,
  ADD COLUMN IF NOT EXISTS level SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quiz_questions_level_check'
  ) THEN
    ALTER TABLE quiz_questions
      ADD CONSTRAINT quiz_questions_level_check
      CHECK (level IS NULL OR level BETWEEN 1 AND 6);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quiz_questions_subject_enum_level
  ON quiz_questions (subject_enum, level);
