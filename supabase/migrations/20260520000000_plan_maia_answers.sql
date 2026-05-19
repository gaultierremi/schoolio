-- Sprint 5 PR S5-4 — Plan Maïa quiz dédié : table plan_maia_answers
--
-- Why : Sprint 4 PR S4-1 a livré le plan quotidien (table plan_maia_daily)
-- mais le quiz dédié restait à faire. En attendant, on incrémentait
-- completed_count via un trigger sur assignment_question_answers (hack
-- temporaire car les questions du plan étaient aussi dans les devoirs).
--
-- Maintenant on a un vrai quiz Plan Maïa : table dédiée pour tracker les
-- réponses, trigger DB synchronise plan_maia_daily.completed_count.
--
-- Règle CLAUDE.md #23 : never-DELETE événementiel — `plan_maia_answers`
-- rejoint la liste (stats longitudinales direction futures).
-- Règle #8 : RLS enabled.
-- Règle #10 : CHECK sur enum-like (response_data shape libre, mais
--             pas d'enum à check ici).
-- Règle #11 : FK ON DELETE explicite (CASCADE depuis plan/user, RESTRICT
--             depuis question/school car on veut garder les stats même
--             si la question est supprimée — pas le cas réel mais defensive).
-- Règle #12 : SECURITY DEFINER + SET search_path = '' sur trigger function.

BEGIN;

CREATE TABLE IF NOT EXISTS public.plan_maia_answers (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id               UUID         NOT NULL REFERENCES public.plan_maia_daily(id) ON DELETE CASCADE,
  question_id           UUID         NOT NULL REFERENCES public.teacher_questions(id) ON DELETE CASCADE,
  user_id               UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id             UUID         NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  is_correct            BOOLEAN      NOT NULL,
  requested_solution    BOOLEAN      NOT NULL DEFAULT FALSE,
  requested_explanation BOOLEAN      NOT NULL DEFAULT FALSE,
  -- response_data : forme libre (texte/numerique/MCQ index) — debug + audit
  -- futurs replays. Pas un blocker schema.
  response_data         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_maia_answers_plan
  ON public.plan_maia_answers(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_maia_answers_user
  ON public.plan_maia_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_maia_answers_question
  ON public.plan_maia_answers(question_id);

ALTER TABLE public.plan_maia_answers ENABLE ROW LEVEL SECURITY;

-- L'élève voit/écrit uniquement ses propres réponses
CREATE POLICY "plan_maia_answers_student_select_own"
  ON public.plan_maia_answers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "plan_maia_answers_student_insert_own"
  ON public.plan_maia_answers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Pas de UPDATE/DELETE pour l'élève (règle #23 never-DELETE événementiel).
-- Pas de policy UPDATE → bloqué de fait (RLS deny par défaut).
-- DELETE bloqué pour empêcher l'effacement de stats longitudinales.

-- ============================================================================
-- Trigger DB pour incrémenter plan_maia_daily.completed_count
-- ============================================================================
--
-- Cohérent avec trg_sync_plan_maia_completed_count sur assignment_question_answers
-- (livré PR S4-1). Ici on est DIRECTEMENT sur plan_maia_answers donc plus
-- simple : on a déjà plan_id en colonne.
--
-- Idempotent via COUNT DISTINCT : un élève qui retry la même question n'est
-- pas double-compté. Aligne avec la sémantique "completed = N questions
-- distinctes du plan répondues".

CREATE OR REPLACE FUNCTION public.sync_plan_completed_count_from_plan_answers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total         int;
  v_done          int;
  v_question_ids  jsonb;
BEGIN
  -- Récupère la liste des question_ids du plan
  SELECT plan_data->'question_ids' INTO v_question_ids
  FROM public.plan_maia_daily
  WHERE id = NEW.plan_id;

  IF v_question_ids IS NULL THEN
    RETURN NEW;
  END IF;

  v_total := jsonb_array_length(v_question_ids);

  -- Compte questions DISTINCTES du plan répondues (idempotent retry-safe)
  SELECT COUNT(DISTINCT question_id) INTO v_done
  FROM public.plan_maia_answers
  WHERE plan_id = NEW.plan_id
    AND question_id::text IN (SELECT jsonb_array_elements_text(v_question_ids));

  -- Update plan_maia_daily.completed_count + completed_at
  UPDATE public.plan_maia_daily
  SET
    completed_count = v_done,
    completed_at = CASE
      WHEN v_done >= v_total AND completed_at IS NULL THEN NOW()
      ELSE completed_at
    END,
    updated_at = NOW()
  WHERE id = NEW.plan_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_plan_completed_count_from_plan_answers() IS
  'Sprint 5 PR S5-4 — Sync plan_maia_daily.completed_count sur INSERT plan_maia_answers. Idempotent via COUNT DISTINCT.';

DROP TRIGGER IF EXISTS trg_sync_plan_completed_count_from_plan_answers
  ON public.plan_maia_answers;
CREATE TRIGGER trg_sync_plan_completed_count_from_plan_answers
  AFTER INSERT ON public.plan_maia_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_plan_completed_count_from_plan_answers();

COMMIT;
