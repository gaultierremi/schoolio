-- Sprint 4 PR S4-1 (hot-fix hard review I9)
--
-- Trigger DB pour auto-incrementer `plan_maia_daily.completed_count` quand
-- l'élève répond à une question du plan via les devoirs assignés.
--
-- Contexte temporaire : la session quiz dédiée Plan Maïa arrive en PR S4-2
-- (table `plan_maia_answers` séparée + API check-answer-plan). En attendant,
-- les questions du plan sont aussi présentes dans les devoirs assignés (via
-- assignment_question_answers), et c'est cette table qui alimente le compteur
-- "X questions répondues aujourd'hui" sur la card élève.
--
-- Règle CLAUDE.md #12 : SECURITY DEFINER → SET search_path = '' obligatoire.
-- Règle CLAUDE.md #23 : never-DELETE — on UPDATE plan_maia_daily, jamais delete.
--
-- Idempotent : on recompute completed_count via COUNT(DISTINCT) au lieu d'un
-- simple +1 → si l'élève répond plusieurs fois à la même question (retry),
-- le compteur ne double-compte pas. Et si on backfill plus tard, les compteurs
-- restent cohérents.

CREATE OR REPLACE FUNCTION sync_plan_maia_completed_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan_date     date;
  v_plan_id       uuid;
  v_question_ids  jsonb;
  v_total         int;
  v_done          int;
BEGIN
  -- Calcule la date en Europe/Brussels (cohérent avec lib/plan-maia-date.ts).
  v_plan_date := (NEW.created_at AT TIME ZONE 'Europe/Brussels')::date;

  -- Cherche le plan du jour de l'élève.
  SELECT id, plan_data->'question_ids'
    INTO v_plan_id, v_question_ids
  FROM public.plan_maia_daily
  WHERE user_id = NEW.student_user_id
    AND plan_date = v_plan_date;

  -- Pas de plan ce jour-là → rien à faire.
  IF v_plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- La question répondue n'est pas dans le plan → rien à faire.
  IF NOT (v_question_ids ? NEW.question_id::text) THEN
    RETURN NEW;
  END IF;

  -- Recompute completed_count = nombre de questions distinctes du plan
  -- répondues aujourd'hui (idempotent, gère les retries).
  SELECT jsonb_array_length(v_question_ids) INTO v_total;

  SELECT COUNT(DISTINCT aqa.question_id) INTO v_done
  FROM public.assignment_question_answers aqa
  WHERE aqa.student_user_id = NEW.student_user_id
    AND (aqa.created_at AT TIME ZONE 'Europe/Brussels')::date = v_plan_date
    AND aqa.question_id::text IN (
      SELECT jsonb_array_elements_text(v_question_ids)
    );

  -- Update — completed_at se déclenche seulement quand tout est répondu,
  -- et ne se réinitialise jamais si l'élève dépasse (pas de "downgrade").
  UPDATE public.plan_maia_daily
  SET
    completed_count = v_done,
    completed_at = CASE
      WHEN v_done >= v_total AND completed_at IS NULL THEN NOW()
      ELSE completed_at
    END,
    updated_at = NOW()
  WHERE id = v_plan_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_plan_maia_completed_count() IS
  'Sprint 4 — Sync plan_maia_daily.completed_count quand un élève répond à une question via assignment_question_answers. Idempotent (COUNT DISTINCT). Timezone Europe/Brussels alignée avec lib/plan-maia-date.ts.';

-- Trigger AFTER INSERT pour ne pas bloquer la réponse si le sync échoue.
DROP TRIGGER IF EXISTS trg_sync_plan_maia_completed_count ON assignment_question_answers;
CREATE TRIGGER trg_sync_plan_maia_completed_count
  AFTER INSERT ON assignment_question_answers
  FOR EACH ROW
  EXECUTE FUNCTION sync_plan_maia_completed_count();

COMMENT ON TRIGGER trg_sync_plan_maia_completed_count ON assignment_question_answers IS
  'Sprint 4 — Alimente plan_maia_daily.completed_count lors des réponses devoirs.';
