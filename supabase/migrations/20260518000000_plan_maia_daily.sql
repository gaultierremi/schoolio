-- Sprint 4 — Plan Maïa quotidien (foundation table)
--
-- Mémoire `project_plan_maia_daily` :
--   "Plan Maïa = 20 min multi-matière auto chaque matin, pick-and-choose,
--    équilibré non-adaptatif au skip"
--
-- 1 row par (user_id, plan_date). Le plan est généré une fois (par batch nuit
-- Sprint 4b OU lazy à la première requête de l'élève), puis figé pour la journée.
--
-- Strategy hybride :
--   - Sprint 4 PR S4-1 (cette PR) : lazy generation à la première requête
--   - Sprint 4 PR S4-2 (à venir) : batch Trigger.dev cron 04:00 UTC qui populera
--     toutes les rows pour TOUS les élèves avant qu'ils ne se connectent
--
-- Never-DELETE par défaut (CLAUDE.md rule #23) : on garde l'historique pour
-- analyser efficacité du Plan Maïa au fil du temps.
--
-- Schema deliberately wide (JSONB) pour itérer le contenu plan sans refactor
-- DB. Le shape exact est versionné via `plan_version`.

BEGIN;

CREATE TABLE IF NOT EXISTS public.plan_maia_daily (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id       UUID         NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  plan_date       DATE         NOT NULL,  -- 1 plan par jour par élève
  -- Version du shape JSONB (incrémenté si refactor breaking)
  plan_version    SMALLINT     NOT NULL DEFAULT 1 CHECK (plan_version > 0),
  -- Contenu du plan : { question_ids: uuid[], target_minutes: int,
  --                     concept_breakdown: { faible: int, revision: int, nouveau: int },
  --                     generated_strategy: text }
  plan_data       JSONB        NOT NULL,
  -- Total minutes attendues (pour affichage UI "Plan du jour ~20 min")
  target_minutes  SMALLINT     NOT NULL DEFAULT 20 CHECK (target_minutes BETWEEN 5 AND 60),
  -- Stratégie de génération utilisée (audit + debugging)
  generated_by    TEXT         NOT NULL DEFAULT 'lazy_runtime'
                                CHECK (generated_by IN ('lazy_runtime', 'batch_cron', 'manual')),
  generated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Tracking complétion par l'élève (incrémenté au fil des questions répondues)
  completed_count INT          NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  -- Si l'élève a marqué comme terminé manuellement ou complété tous
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, plan_date)
);

-- Index principal : fetch "plan du jour de l'élève X"
CREATE INDEX IF NOT EXISTS idx_plan_maia_daily_user_date
  ON public.plan_maia_daily(user_id, plan_date DESC);

-- Index tenant : analytics admin "plans générés par école/jour"
CREATE INDEX IF NOT EXISTS idx_plan_maia_daily_school_date
  ON public.plan_maia_daily(school_id, plan_date);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_plan_maia_daily_updated_at()
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

CREATE TRIGGER plan_maia_daily_updated_at
  BEFORE UPDATE ON public.plan_maia_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_plan_maia_daily_updated_at();

-- RLS strict (rule #8 CLAUDE.md)
ALTER TABLE public.plan_maia_daily ENABLE ROW LEVEL SECURITY;

-- Lecture : l'élève voit uniquement son propre plan.
-- (Profs ne voient pas les plans des élèves pour respecter la privacy —
--  les analytics passent par admin avec service_role.)
CREATE POLICY "plan_maia_daily_self_read"
  ON public.plan_maia_daily FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Pas d'écriture côté client : les plans sont générés exclusivement côté
-- serveur (lazy_runtime ou batch_cron) via service_role. WITH CHECK (false)
-- bloque toute écriture authenticated.
CREATE POLICY "plan_maia_daily_no_client_write"
  ON public.plan_maia_daily FOR INSERT TO authenticated
  WITH CHECK (FALSE);

CREATE POLICY "plan_maia_daily_no_client_update"
  ON public.plan_maia_daily FOR UPDATE TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

CREATE POLICY "plan_maia_daily_no_client_delete"
  ON public.plan_maia_daily FOR DELETE TO authenticated
  USING (FALSE);

COMMENT ON TABLE public.plan_maia_daily IS
  'Sprint 4 — Plan Maïa quotidien. 1 row par (user_id, plan_date). Plan généré lazy ou batch cron, figé pour la journée. JSONB plan_data versionné via plan_version. Never-DELETE.';

COMMENT ON COLUMN public.plan_maia_daily.plan_data IS
  'Shape v1 : { question_ids: uuid[], target_minutes: int, concept_breakdown: { faible: int, revision: int, nouveau: int }, generated_strategy: text }';

COMMIT;
