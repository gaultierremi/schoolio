-- Side Sprint Prof — Onboarding prof annuel : niveaux enseignés
--
-- Chaque rentrée scolaire, un prof doit déclarer les niveaux qu'il
-- enseignera cette année (1ère, 4ème, etc.). Cela filtre :
--   - Le dropdown de cohortes lors de la création d'une sous-classe matière
--   - (Plus tard) Les dashboards stats direction
--
-- Modèle = 1 row par (teacher_id, academic_year). Le prof refait
-- l'onboarding chaque année automatiquement (pas de row pour l'année
-- courante → page /onboarding/teaching-levels apparaît au login).
--
-- taught_levels = niveaux FWB secondaire 1-6 (smallint[]).

BEGIN;

CREATE TABLE IF NOT EXISTS public.teacher_teaching_years (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id       UUID         NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  academic_year   TEXT         NOT NULL CHECK (academic_year ~ '^\d{4}/\d{4}$'),
  taught_levels   SMALLINT[]   NOT NULL DEFAULT ARRAY[]::SMALLINT[]
                              CHECK (array_length(taught_levels, 1) IS NULL
                                     OR (array_length(taught_levels, 1) <= 6
                                         AND taught_levels <@ ARRAY[1,2,3,4,5,6]::SMALLINT[])),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_teacher_teaching_years_teacher_year
  ON public.teacher_teaching_years(teacher_id, academic_year);

CREATE OR REPLACE FUNCTION public.update_teacher_teaching_years_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER teacher_teaching_years_updated_at
  BEFORE UPDATE ON public.teacher_teaching_years
  FOR EACH ROW EXECUTE FUNCTION public.update_teacher_teaching_years_updated_at();

ALTER TABLE public.teacher_teaching_years ENABLE ROW LEVEL SECURITY;

-- Prof manage ses propres rows
CREATE POLICY "tty_teacher_manage_own"
  ON public.teacher_teaching_years FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid() AND school_id = public.current_user_school_id());

-- Lecture cross-prof dans la même école (utile pour direction stats futures
-- + permettre à un admin école de voir l'attribution des niveaux)
CREATE POLICY "tty_school_read"
  ON public.teacher_teaching_years FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

COMMIT;
