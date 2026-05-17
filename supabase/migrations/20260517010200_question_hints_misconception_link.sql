-- Sprint 2B — Lien hint ↔ misconception
--
-- Why : la mémoire `project_curation_concept_view` impose
-- "Hints banks éditables ordonnés par misconception". Sans FK
-- question_hints.misconception_id, il faudra ajouter cette colonne plus tard
-- avec un backfill manuel. Coût aujourd'hui = 5 lignes SQL, gain future-proof.
--
-- NULLABLE : un hint peut adresser plusieurs misconceptions ou aucune
-- (cas guided_question générique). NULL = pas catégorisé.
--
-- ON DELETE SET NULL : si une misconception est supprimée, le hint survit
-- (juste découplé). Évite la perte de hints rédigés par le prof.
--
-- Index partial sur (misconception_id) WHERE NOT NULL : permet le query
-- "list hints addressing this misconception across all questions" (Sprint 2C+
-- pour mass-edit + analytics élève-bloque-sur-misconception).

BEGIN;

ALTER TABLE public.question_hints
  ADD COLUMN IF NOT EXISTS misconception_id UUID
    REFERENCES public.concept_misconceptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_question_hints_misconception
  ON public.question_hints(misconception_id)
  WHERE misconception_id IS NOT NULL;

COMMENT ON COLUMN public.question_hints.misconception_id IS
  'Sprint 2B — Lien optionnel vers la misconception adressée par ce hint. NULL = pas catégorisé. ON DELETE SET NULL préserve le hint si la misconception est supprimée.';

COMMIT;
