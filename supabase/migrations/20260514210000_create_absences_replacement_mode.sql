-- Mode Prof Remplaçant — table absences + extension cockpit_sessions
-- Inspiré du cas Adrien : prof en burn out qui doit encore gérer son remplaçant.
-- Objectif : zéro charge mentale pour le titulaire, remplaçant armé dès l'entrée.

CREATE TABLE absences (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  replacement_code  TEXT        NOT NULL UNIQUE,
  titulaire_name    TEXT        NOT NULL,   -- mock pour POC; sera FK user en prod
  replacement_name  TEXT,                   -- "Mme Martin", générique, ou NULL
  start_date        DATE        NOT NULL,
  end_date          DATE,                   -- NULL = "à préciser"
  notes             TEXT,                   -- message du titulaire pour le remplaçant
  briefing_cache    TEXT,                   -- briefing IA mis en cache pour éviter regénération
  return_report_cache TEXT,                 -- rapport de retour IA (généré au retour)
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT absences_dates_check
    CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT absences_code_format_check
    CHECK (replacement_code ~ '^[0-9]{6}$')
);

-- Extension cockpit_sessions pour sessions de remplacement
ALTER TABLE cockpit_sessions
  ADD COLUMN is_replacement     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN replacement_code   TEXT REFERENCES absences(replacement_code) ON DELETE SET NULL;

-- RLS obligatoire (CLAUDE.md rule 8)
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

-- SELECT public : remplaçant peut lire son briefing sans auth
CREATE POLICY "absences_anon_select"
  ON absences FOR SELECT TO anon USING (true);

-- INSERT/UPDATE/DELETE : service role uniquement

-- Index
CREATE INDEX absences_replacement_code_idx ON absences (replacement_code);
CREATE INDEX absences_active_idx ON absences (is_active) WHERE is_active = true;
