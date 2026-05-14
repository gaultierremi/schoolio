-- Side Sprint Prof A.3 — Tuteur socratique (panel d'indices pré-baked)
--
-- Why : le tuteur dans un devoir async (cf. mockup dashboard-eleve-session)
-- affiche 3 bulles d'indices animées en cascade + boutons "autre indice /
-- théorie / 👍👎". Architecture spec MVP ligne 263 : "Système d'indices
-- pré-baked, pas chatbot — 0-IA-runtime + 0 risque leak réponse + curation
-- prof native". Cette table stocke les templates d'indices par question.
--
-- Les hints sont :
--   - rédigés par le prof (curation native) ou générés OFFLINE par Claude
--     puis validés par le prof (approved_at NOT NULL = visible élève)
--   - ordonnés (ordinal 1-5) : indice 1 est le plus doux, indice 5 le plus
--     fort. L'élève déverrouille séquentiellement via "Autre indice"
--   - template avec slot {wrong_answer} substitué côté API runtime (la
--     réponse de l'élève) — pas d'autre slot dynamique pour ce MVP

BEGIN;

CREATE TABLE IF NOT EXISTS public.question_hints (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID         NOT NULL REFERENCES public.teacher_questions(id) ON DELETE CASCADE,
  school_id    UUID         NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  ordinal      SMALLINT     NOT NULL CHECK (ordinal BETWEEN 1 AND 5),
  template     TEXT         NOT NULL CHECK (length(template) BETWEEN 20 AND 1500),
  -- Template avec slots remplis runtime. Slots supportés ce sprint :
  --   {wrong_answer} : ce que l'élève a écrit/sélectionné
  -- Autres slots = static, déjà résolus au moment de la curation.
  kind         TEXT         NOT NULL DEFAULT 'guided_question'
                            CHECK (kind IN ('validation', 'guided_question', 'encouragement', 'strong_hint')),
  -- 'validation' : "Tu as bien utilisé X 👍" (renforce ce qui est correct)
  -- 'guided_question' : "Regarde Y : ... Combien font ... ?" (méthode socratique)
  -- 'encouragement' : "C'est une erreur classique en X, tu vas y arriver"
  -- 'strong_hint' : indice direct juste avant la réponse (réservé ordinal 4-5)
  approved_at  TIMESTAMPTZ,
  approved_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  -- approved_at NULL = brouillon prof (pas visible élève). NOT NULL = approuvé.
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(question_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_question_hints_question
  ON public.question_hints(question_id);
CREATE INDEX IF NOT EXISTS idx_question_hints_approved
  ON public.question_hints(question_id, ordinal)
  WHERE approved_at IS NOT NULL;

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION public.update_question_hints_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER question_hints_updated_at
  BEFORE UPDATE ON public.question_hints
  FOR EACH ROW EXECUTE FUNCTION public.update_question_hints_updated_at();

ALTER TABLE public.question_hints ENABLE ROW LEVEL SECURITY;

-- Lecture : élèves voient les hints APPROUVÉS de leur tenant.
-- Profs voient TOUS les hints (incl. brouillons) de leur tenant.
CREATE POLICY "question_hints_student_read_approved"
  ON public.question_hints FOR SELECT TO authenticated
  USING (
    school_id = public.current_user_school_id()
    AND approved_at IS NOT NULL
  );

CREATE POLICY "question_hints_teacher_read_all"
  ON public.question_hints FOR SELECT TO authenticated
  USING (
    school_id = public.current_user_school_id()
    AND public.is_current_user_school_teacher()
  );

-- Écritures : profs uniquement, sur leur tenant.
CREATE POLICY "question_hints_teacher_insert"
  ON public.question_hints FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_user_school_id()
    AND public.is_current_user_school_teacher()
  );

CREATE POLICY "question_hints_teacher_update"
  ON public.question_hints FOR UPDATE TO authenticated
  USING (
    school_id = public.current_user_school_id()
    AND public.is_current_user_school_teacher()
  )
  WITH CHECK (
    school_id = public.current_user_school_id()
  );

CREATE POLICY "question_hints_teacher_delete"
  ON public.question_hints FOR DELETE TO authenticated
  USING (
    school_id = public.current_user_school_id()
    AND public.is_current_user_school_teacher()
  );

COMMIT;
