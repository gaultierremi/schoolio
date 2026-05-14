-- Side Sprint Prof — Phase 1 : lien question ↔ concept pour A.5 remédiation
--
-- Aujourd'hui teacher_questions n'a pas de FK vers concepts. Conséquence :
-- impossible de proposer un "mini-détour adaptif" (A.5 du mockup) sur le
-- concept manqué, et impossible de connecter une question à la matière
-- pré-seedée (corpus FWB) pour la couche canonique.
--
-- Phase 1 (cette migration) : ajoute la colonne concept_id NULLABLE.
--   - NULL = pas encore mappé (rétrocompat avec questions existantes)
--   - Quand le pipeline d'ingestion+génération sera concept-aware (Phase 2,
--     pré-seed corpus), il populera concept_id par construction.
--   - Un backfill rétroactif via classifier Claude est possible plus tard
--     pour les questions existantes orphelines.

BEGIN;

ALTER TABLE public.teacher_questions
  ADD COLUMN IF NOT EXISTS concept_id UUID
  REFERENCES public.concepts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teacher_questions_concept
  ON public.teacher_questions(concept_id)
  WHERE concept_id IS NOT NULL;

COMMENT ON COLUMN public.teacher_questions.concept_id IS
  'FK optionnel vers le concept canonique (ou prof) auquel la question est rattachée. NULL = pas mappée. Populé par le pipeline de génération concept-aware ou via classifier post-hoc.';

COMMIT;
