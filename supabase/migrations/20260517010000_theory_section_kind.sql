-- Sprint 2B — Vue concept unifiée : théorie en sections typées
--
-- Why : la vue concept unifiée (prof) édite la théorie en 5 cartes typées
-- (définition, formules, exemples, prérequis, pièges) au lieu d'un blob
-- libre. Cf. mémoire `project_curation_concept_view`.
--
-- Pourquoi pas de backfill du section_kind :
--   - Le pipeline d'ingestion existant écrit theory_blocks avec un
--     paragraph_ordinal arbitraire (1..N). Aucune sémantique de "type" sur
--     l'ordinal. Backfill aveugle (ordinal 1 → "definition", etc.) produirait
--     des classifications fausses en prod (l'ordinal 2 d'un concept de chimie
--     ≠ forcément "formules").
--   - Stratégie : on laisse section_kind NULLABLE pour les rows existantes.
--     L'UI ConceptEditor affiche un bloc "Théorie non classée → classer"
--     avec dropdown direct sur les 5 valeurs. Le prof valide section par
--     section au fur et à mesure (dogfood-friendly, pas de big-bang).
--   - Sprint 2C/3 : le pipeline d'ingestion sera mis à jour pour écrire
--     section_kind directement à la génération AI.
--
-- Pas de UNIQUE(concept_id, section_kind) en DB : permet la cohabitation
-- transitoire avec les rows ordinal-only. La déduplication se fait côté API
-- (PUT theory upserte sur (concept_id, section_kind) au niveau Node).
-- Sprint 2C ajoutera la contrainte UNIQUE une fois la transition terminée.

BEGIN;

ALTER TABLE public.theory_blocks
  ADD COLUMN IF NOT EXISTS section_kind TEXT
    CHECK (section_kind IN ('definition', 'formules', 'exemples', 'prerequis', 'pieges'));

-- Index partial pour la requête API "fetch theory by concept_id + section_kind"
-- (n'indexe que les rows déjà classées, économique à 500 profs scale).
CREATE INDEX IF NOT EXISTS idx_theory_blocks_concept_section
  ON public.theory_blocks(concept_id, section_kind)
  WHERE section_kind IS NOT NULL;

COMMENT ON COLUMN public.theory_blocks.section_kind IS
  'Type de section (Sprint 2B). NULL = à classer manuellement par le prof. Valeurs : definition | formules | exemples | prerequis | pieges. La contrainte UNIQUE(concept_id, section_kind) sera ajoutée en Sprint 2C une fois la migration des rows legacy terminée.';

COMMIT;
