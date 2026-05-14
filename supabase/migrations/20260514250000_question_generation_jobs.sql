-- Side Sprint Prof — Tracking jobs génération questions (UX progress bar)
--
-- Aujourd'hui /api/courses/generate-questions est synchrone : le client
-- attend la fin de la fonction (~2-4min sur gros syllabus) puis reçoit
-- la réponse en bloc. La barre UI reste à 0% tout ce temps → UX médiocre.
--
-- Cette table permet le pattern async : POST crée un job + retourne jobId
-- immédiatement, runGeneration tourne en background (waitUntil) et update
-- les champs phase / questions_inserted au fur et à mesure. Le client
-- poll la table (ou subscribe Realtime) pour afficher progress + ETA.

BEGIN;

CREATE TABLE IF NOT EXISTS public.question_generation_jobs (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id            UUID         NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  teacher_id           UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id            UUID         NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  status               TEXT         NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'running', 'done', 'failed')),
  phase                TEXT         NOT NULL DEFAULT 'queued'
                                    CHECK (phase IN ('queued', 'extracting_pdf', 'generating_workers', 'validating', 'inserting_db', 'done', 'failed')),
  total_target         INT          NOT NULL CHECK (total_target > 0),
  worker_count         INT          NOT NULL DEFAULT 0,
  workers_completed    INT          NOT NULL DEFAULT 0,
  questions_raw        INT          NOT NULL DEFAULT 0,
  questions_inserted   INT          NOT NULL DEFAULT 0,
  pages_count          INT,
  page_range_start     INT,
  page_range_end       INT,
  started_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  phase_changed_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ,
  error_message        TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_generation_jobs_teacher_status
  ON public.question_generation_jobs(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_question_generation_jobs_course
  ON public.question_generation_jobs(course_id);

ALTER TABLE public.question_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Prof read ses propres jobs
CREATE POLICY "qg_jobs_teacher_read"
  ON public.question_generation_jobs FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());

-- Aucune écriture côté authenticated — uniquement service_role via la route API
CREATE POLICY "qg_jobs_no_user_writes"
  ON public.question_generation_jobs FOR INSERT TO authenticated
  WITH CHECK (FALSE);

CREATE POLICY "qg_jobs_no_user_update"
  ON public.question_generation_jobs FOR UPDATE TO authenticated
  USING (FALSE);

-- Realtime publication pour permettre au client de subscribe aux changements
-- (alternative au polling). Le client peut aussi poller via GET /status.
ALTER PUBLICATION supabase_realtime ADD TABLE public.question_generation_jobs;

COMMIT;
