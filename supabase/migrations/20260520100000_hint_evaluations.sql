-- Sprint 6 PR S6-7 — Évaluation 👍/👎 des indices tuteur par l'élève
--
-- Why : le composant `TutorPanel` a déjà des boutons ThumbsUp/Down mais le
-- feedback est perdu au refresh (state local). On veut persister pour :
-- - Analytics tuteur : quels indices marchent / sont nuls
-- - Boucle d'amélioration curation prof
-- - Future remontée vers le prof "indice X évalué négativement N fois"
--
-- Règles CLAUDE.md respectées :
-- - #8 RLS enabled
-- - #10 CHECK enum sur evaluation
-- - #11 FK ON DELETE explicite
-- - #23 never-DELETE : pas une table "event" pure (1 par user×hint = config),
--   mais on prévient quand même : pas de policy DELETE student.

BEGIN;

CREATE TABLE IF NOT EXISTS public.hint_evaluations (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hint_id      UUID         NOT NULL REFERENCES public.question_hints(id) ON DELETE CASCADE,
  school_id    UUID         NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  evaluation   TEXT         NOT NULL CHECK (evaluation IN ('up', 'down')),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, hint_id)
);

CREATE INDEX IF NOT EXISTS idx_hint_evaluations_hint
  ON public.hint_evaluations(hint_id);
CREATE INDEX IF NOT EXISTS idx_hint_evaluations_user
  ON public.hint_evaluations(user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_hint_evaluations_updated_at()
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

CREATE TRIGGER hint_evaluations_updated_at
  BEFORE UPDATE ON public.hint_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_hint_evaluations_updated_at();

ALTER TABLE public.hint_evaluations ENABLE ROW LEVEL SECURITY;

-- Élève : SELECT/INSERT/UPDATE de ses propres évaluations
CREATE POLICY "hint_evaluations_student_select_own"
  ON public.hint_evaluations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "hint_evaluations_student_insert_own"
  ON public.hint_evaluations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "hint_evaluations_student_update_own"
  ON public.hint_evaluations FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Prof : SELECT des évaluations de son tenant (analytics curation)
CREATE POLICY "hint_evaluations_teacher_select_tenant"
  ON public.hint_evaluations FOR SELECT TO authenticated
  USING (
    school_id = public.current_user_school_id()
    AND public.is_current_user_school_teacher()
  );

-- Pas de DELETE policy (RLS deny par défaut) — preserve longitudinal data.

COMMIT;
