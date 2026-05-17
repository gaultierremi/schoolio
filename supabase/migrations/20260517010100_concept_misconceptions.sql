-- Sprint 2B — Vue concept unifiée : misconceptions par concept
--
-- Why : la vue concept unifiée affiche une liste éditable des erreurs
-- conceptuelles classiques (ex: "Confusion masse / poids" pour mécanique).
-- Ces misconceptions servent à :
--   1. Documenter pour le prof les erreurs récurrentes attendues
--   2. Linker des hints à une misconception spécifique (FK question_hints.misconception_id, migration suivante)
--   3. Future : analytics élève "élève bloque sur misconception X"
--
-- Modèle : 1-to-many (concept owns misconceptions). Une même misconception
-- conceptuelle ("Confusion vitesse/accélération") sera dupliquée dans 5
-- concepts de mécanique. Acceptable pour MVP dogfood (~125k rows à terme
-- avec 500 profs × 50 concepts × 5). Migration vers many-to-many possible
-- sans breaking change si volume justifie (Sprint 2C+).
--
-- Idempotent helper : on définit is_current_user_school_teacher() ici car
-- les migrations précédentes (content_snippets, question_hints) l'utilisent
-- mais ne la définissent pas — probablement définie manuellement en prod.
-- CREATE OR REPLACE est sûr : si elle existe déjà, on la remplace par la
-- même définition; si non, on la crée.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_current_user_school_teacher()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'teacher'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_current_user_school_teacher() TO authenticated;

-- Table concept_misconceptions
CREATE TABLE IF NOT EXISTS public.concept_misconceptions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id  UUID         NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  school_id   UUID         NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  -- Label libre du prof, ex: "Confusion entre masse et poids".
  -- Bornes : 1-300 chars (longueur similaire à concepts.name).
  label       TEXT         NOT NULL CHECK (length(label) BETWEEN 1 AND 300),
  -- Ordinal 1-10 pour ordre d'affichage par le prof (drag-reorder Sprint 2C+).
  -- 10 max suffit largement par concept (rare d'avoir > 5 en pratique).
  ordinal     SMALLINT     NOT NULL CHECK (ordinal BETWEEN 1 AND 10),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(concept_id, ordinal)
);

-- Index pour fetch "all misconceptions of a concept" (cas dominant).
CREATE INDEX IF NOT EXISTS idx_concept_misconceptions_concept
  ON public.concept_misconceptions(concept_id);

-- Index tenant pour "list all misconceptions of school" (admin/analytics futur).
-- Partiel sur ordinal pour aussi servir l'ordre d'affichage.
CREATE INDEX IF NOT EXISTS idx_concept_misconceptions_school
  ON public.concept_misconceptions(school_id, concept_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_concept_misconceptions_updated_at()
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

CREATE TRIGGER concept_misconceptions_updated_at
  BEFORE UPDATE ON public.concept_misconceptions
  FOR EACH ROW EXECUTE FUNCTION public.update_concept_misconceptions_updated_at();

-- RLS strict (rule #8 CLAUDE.md : RLS sur toute nouvelle table)
ALTER TABLE public.concept_misconceptions ENABLE ROW LEVEL SECURITY;

-- Lecture : profs ET élèves voient les misconceptions de leur tenant.
-- Future : misconception sera consultée par tuteur élève quand il bloque.
CREATE POLICY "concept_misconceptions_tenant_read"
  ON public.concept_misconceptions FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

-- Écritures : profs uniquement, sur leur tenant.
CREATE POLICY "concept_misconceptions_teacher_insert"
  ON public.concept_misconceptions FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_user_school_id()
    AND public.is_current_user_school_teacher()
  );

CREATE POLICY "concept_misconceptions_teacher_update"
  ON public.concept_misconceptions FOR UPDATE TO authenticated
  USING (
    school_id = public.current_user_school_id()
    AND public.is_current_user_school_teacher()
  )
  WITH CHECK (
    school_id = public.current_user_school_id()
  );

CREATE POLICY "concept_misconceptions_teacher_delete"
  ON public.concept_misconceptions FOR DELETE TO authenticated
  USING (
    school_id = public.current_user_school_id()
    AND public.is_current_user_school_teacher()
  );

COMMENT ON TABLE public.concept_misconceptions IS
  'Sprint 2B — Misconceptions (erreurs conceptuelles classiques) attachées à un concept. Modèle 1-to-many : chaque concept possède ses misconceptions, duplication acceptée à 500 profs scale. Future m2m migration possible sans breaking change.';

COMMIT;
