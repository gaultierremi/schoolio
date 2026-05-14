-- Side Sprint Prof B — Extend content_snippets for syllabus extraction pipeline
--
-- Why : nouveau pipeline d'extraction PDF (cf docs/superpowers/specs/
-- 2026-05-14-pdf-extraction-design.md) produit des snippets de théorie
-- ET des questions en 1 appel Anthropic Sonnet par chapitre. Pour stocker
-- ces snippets sans avoir à créer des `concepts` riches au préalable,
-- on étend la CHECK source_kind avec 'syllabus_extraction' et on rend
-- concept_id nullable (les snippets syllabus_extraction sont attachés
-- à un course + chapter title, pas à un concept formel).
--
-- Note constraint name : la CHECK source_kind est définie inline dans
-- 20260514140000_content_snippets.sql (pas de CONSTRAINT name explicite),
-- donc Postgres l'a auto-nommée `content_snippets_source_kind_check` selon
-- la convention <table>_<column>_check. C'est le nom utilisé ci-dessous.

BEGIN;

-- 1) Drop puis recreate la CHECK constraint source_kind avec la nouvelle valeur
ALTER TABLE public.content_snippets DROP CONSTRAINT IF EXISTS content_snippets_source_kind_check;
ALTER TABLE public.content_snippets ADD CONSTRAINT content_snippets_source_kind_check
  CHECK (source_kind IN ('concept_definition', 'theory_block', 'manual_teacher', 'syllabus_extraction'));

-- 2) Rendre concept_id nullable (pour syllabus_extraction qui n'a pas de concept formel)
ALTER TABLE public.content_snippets ALTER COLUMN concept_id DROP NOT NULL;

-- 3) Ajouter une colonne course_id pour le scoping des snippets syllabus_extraction
-- (les autres source_kind sont liés via concept_id → curriculum_program → course implicite)
ALTER TABLE public.content_snippets ADD COLUMN IF NOT EXISTS course_id UUID
  REFERENCES public.courses(id) ON DELETE CASCADE;

-- 4) Index pour les queries du tuteur "donne-moi les snippets de ce cours"
CREATE INDEX IF NOT EXISTS idx_content_snippets_course
  ON public.content_snippets(course_id) WHERE course_id IS NOT NULL;

-- 5) Contrainte cohérence : syllabus_extraction DOIT avoir course_id, les autres NON
ALTER TABLE public.content_snippets ADD CONSTRAINT content_snippets_source_kind_scope
  CHECK (
    (source_kind = 'syllabus_extraction' AND course_id IS NOT NULL AND concept_id IS NULL)
    OR
    (source_kind != 'syllabus_extraction' AND concept_id IS NOT NULL AND course_id IS NULL)
  );

-- 6) Index dedup pour syllabus_extraction : pas de doublon course + text identique.
-- Si deux chapitres du même course produisent un snippet de texte IDENTIQUE (cas rare,
-- ex: "Définition de l'atome" qui apparaît textuellement dans 2 chapitres), un seul
-- sera inséré. Acceptable trade-off : on évite la dup massive d'un re-trigger sans
-- complexifier l'index avec chapter_title (qui vit dans source_ref JSONB).
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_snippets_syllabus_extraction
  ON public.content_snippets(course_id, md5(text))
  WHERE source_kind = 'syllabus_extraction';

COMMIT;
