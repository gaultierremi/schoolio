-- Side Sprint Prof #4 — Quiz prof live (Kahoot-classe)
--
-- Mécanique pédagogique : prof projette une question sur l'écran de classe,
-- chaque élève répond sur son device. Le système tire ensuite UN élève
-- au hasard parmi ceux ayant répondu, son nom + sa réponse apparaissent
-- sur l'écran prof, l'élève explique à voix haute. Objectif : engagement
-- oral + anti-passivité (chacun sait qu'il peut être tiré au sort).
--
-- Schéma adapté de l'ancien live_sessions (Schoolio, droppé en
-- 20260513180100) avec ajouts Maïa : school_id pour multi-tenant + phase
-- enum + picked_student_id pour le random pick mechanism.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. live_sessions : la session live elle-même
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_sessions (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code                CHAR(6)      NOT NULL UNIQUE
                                   CHECK (code ~ '^[A-Z0-9]{6}$'),
  -- Code court ASCII alphanumérique pour join élève. 30^6 ≈ 729M combos,
  -- collision quasi-impossible. Généré côté Node via crypto.randomBytes
  -- (rule 9) — pas via PostgreSQL RANDOM().
  teacher_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id           UUID         NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  class_id            UUID         REFERENCES public.classes(id) ON DELETE SET NULL,
  course_id           UUID         REFERENCES public.courses(id) ON DELETE SET NULL,
  title               TEXT         NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  question_ids        UUID[]       NOT NULL DEFAULT '{}'::uuid[],
  -- Snapshot des questions choisies au moment du start. Array ordonné.
  -- Pas de FK ici (PG ne supporte pas FK sur tableau) — la cohérence
  -- est validée côté API au moment du start.
  current_index       INT          NOT NULL DEFAULT 0
                                   CHECK (current_index >= 0),
  phase               TEXT         NOT NULL DEFAULT 'lobby'
                                   CHECK (phase IN ('lobby', 'answering', 'revealed', 'picked', 'ended')),
  -- 'lobby'     : élèves rejoignent, prof attend
  -- 'answering' : question affichée, élèves répondent silencieusement
  -- 'revealed'  : prof a révélé la bonne réponse, distribution affichée
  -- 'picked'    : prof a tiré un élève au sort, son nom + réponse projeté
  -- 'ended'     : session terminée (read-only après)
  picked_student_id   UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_code_active
  ON public.live_sessions(code) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_live_sessions_teacher
  ON public.live_sessions(teacher_id);

CREATE OR REPLACE FUNCTION public.update_live_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER live_sessions_updated_at
  BEFORE UPDATE ON public.live_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_live_sessions_updated_at();

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- Prof manage their own sessions.
CREATE POLICY "live_sessions_teacher_manage"
  ON public.live_sessions FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid() AND school_id = public.current_user_school_id());

-- Authenticated users (élèves) can SELECT active sessions to find them by code.
-- RLS limite à : pas terminées + même school (anti-cross-tenant).
CREATE POLICY "live_sessions_student_read_active"
  ON public.live_sessions FOR SELECT TO authenticated
  USING (
    ended_at IS NULL
    AND school_id = public.current_user_school_id()
  );

-- Enable Realtime pour broadcast d'état (phase/current_index/picked_student_id)
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. live_session_participants : qui a rejoint
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_session_participants (
  session_id      UUID         NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  student_user_id UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    TEXT         NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  joined_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_participants_session
  ON public.live_session_participants(session_id);

ALTER TABLE public.live_session_participants ENABLE ROW LEVEL SECURITY;

-- L'élève peut s'inscrire lui-même à une session active.
CREATE POLICY "live_participants_self_insert"
  ON public.live_session_participants FOR INSERT TO authenticated
  WITH CHECK (
    student_user_id = auth.uid()
    AND session_id IN (
      SELECT id FROM public.live_sessions
      WHERE ended_at IS NULL
        AND school_id = public.current_user_school_id()
    )
  );

-- L'élève lit ses propres participations + prof lit tous les participants
-- de ses sessions.
CREATE POLICY "live_participants_read"
  ON public.live_session_participants FOR SELECT TO authenticated
  USING (
    student_user_id = auth.uid()
    OR session_id IN (
      SELECT id FROM public.live_sessions WHERE teacher_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_session_participants;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. live_session_answers : réponses des élèves question par question
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_session_answers (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID         NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  question_id     UUID         NOT NULL REFERENCES public.teacher_questions(id) ON DELETE CASCADE,
  student_user_id UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answer_index    SMALLINT     NOT NULL CHECK (answer_index >= 0),
  is_correct      BOOLEAN      NOT NULL,
  answered_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, question_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_answers_session_question
  ON public.live_session_answers(session_id, question_id);

ALTER TABLE public.live_session_answers ENABLE ROW LEVEL SECURITY;

-- Élève insère sa propre réponse.
CREATE POLICY "live_answers_student_insert"
  ON public.live_session_answers FOR INSERT TO authenticated
  WITH CHECK (
    student_user_id = auth.uid()
    AND session_id IN (
      SELECT id FROM public.live_sessions
      WHERE ended_at IS NULL
        AND phase IN ('answering')
        AND school_id = public.current_user_school_id()
    )
  );

-- Prof lit toutes les réponses de ses sessions + élève lit ses propres réponses.
CREATE POLICY "live_answers_read"
  ON public.live_session_answers FOR SELECT TO authenticated
  USING (
    student_user_id = auth.uid()
    OR session_id IN (
      SELECT id FROM public.live_sessions WHERE teacher_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_session_answers;

COMMIT;
