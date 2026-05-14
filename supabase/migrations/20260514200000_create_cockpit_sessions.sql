-- POC Cockpit Maia — session standalone sans auth
-- Remplace live_sessions pour le POC (no teacher_id, no course_id, no class_id)
-- Lecture publique via Realtime (projecteur anon) ; écriture via service role uniquement

CREATE TABLE cockpit_sessions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT        NOT NULL UNIQUE,
  pdf_key               TEXT        NOT NULL,

  -- Navigation PDF (synchro projecteur)
  current_page          INT         NOT NULL DEFAULT 1,
  scroll_y              FLOAT       NOT NULL DEFAULT 0,
  zoom                  FLOAT       NOT NULL DEFAULT 1.0,
  total_pages           INT         NOT NULL DEFAULT 1,

  -- Projection question QCM
  projected_question_id UUID,
  show_answer           BOOLEAN     NOT NULL DEFAULT false,

  -- Transcription mic
  transcript            TEXT        NOT NULL DEFAULT '',
  listening_active      BOOLEAN     NOT NULL DEFAULT false,

  -- État session
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at              TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cockpit_sessions_pdf_key_check
    CHECK (pdf_key IN ('demo-1', 'demo-2', 'demo-3')),
  CONSTRAINT cockpit_sessions_page_check
    CHECK (current_page >= 1),
  CONSTRAINT cockpit_sessions_zoom_check
    CHECK (zoom BETWEEN 0.5 AND 5.0)
);

-- Table des questions contextuelles générées pendant le cours
CREATE TABLE cockpit_questions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT        NOT NULL REFERENCES cockpit_sessions(code) ON DELETE CASCADE,
  page_start   INT         NOT NULL,
  page_end     INT,
  question     TEXT        NOT NULL,
  options      JSONB       NOT NULL DEFAULT '[]', -- [{letter, text}]
  answer_index INT,
  explanation  TEXT,
  origin       TEXT        NOT NULL DEFAULT 'ai_live',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cockpit_questions_origin_check
    CHECK (origin IN ('ai_live', 'manual'))
);

-- FK projecteur sur questions
ALTER TABLE cockpit_sessions
  ADD CONSTRAINT cockpit_sessions_projected_question_fk
  FOREIGN KEY (projected_question_id)
  REFERENCES cockpit_questions(id)
  ON DELETE SET NULL;

-- RLS obligatoire (CLAUDE.md rule 8)
ALTER TABLE cockpit_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit_questions ENABLE ROW LEVEL SECURITY;

-- SELECT public : projecteur (anon key) + Realtime subscriptions
CREATE POLICY "cockpit_sessions_anon_select"
  ON cockpit_sessions FOR SELECT TO anon USING (true);

CREATE POLICY "cockpit_questions_anon_select"
  ON cockpit_questions FOR SELECT TO anon USING (true);

-- INSERT/UPDATE/DELETE : aucune policy → bloqué pour anon
-- Les routes API écrivent via service role

-- Realtime pour synchro projecteur
ALTER PUBLICATION supabase_realtime ADD TABLE cockpit_sessions;

-- Index performance
CREATE INDEX cockpit_sessions_code_idx   ON cockpit_sessions (code);
CREATE INDEX cockpit_sessions_active_idx ON cockpit_sessions (is_active) WHERE is_active = true;
CREATE INDEX cockpit_questions_session_idx ON cockpit_questions (session_code, page_start);
