-- Side Sprint Prof A.2 — Snippet layer
--
-- Why : Sprint 1 stored le markdown extrait dans ingestion_jobs.extracted_markdown
-- (~80KB-1MB par PDF) puis source_quote sur concepts/theory_blocks (extraits
-- courts qui ont servi à grounder la génération). Pour A.3-A.5 (tuteur
-- socratique, indices, remédiation, explication erreur) on a besoin d'un point
-- d'accès UNIFIÉ et requêtable : "donne-moi les passages du syllabus pertinents
-- pour ce concept" — sans avoir à UNION across 3 tables ni reparser le markdown
-- entier à chaque appel Claude.
--
-- content_snippets est cette couche : une ligne = un extrait court (≤ 4000 ch.)
-- adressable par concept_id, avec source_kind pour distinguer la provenance.
-- Backfill one-shot à la fin pour peupler depuis l'existant (concepts +
-- theory_blocks) afin que le tuteur ait de la matière dès le merge, sans
-- attendre une nouvelle ingestion.

BEGIN;

CREATE TABLE IF NOT EXISTS public.content_snippets (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id        UUID        NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  school_id         UUID        NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  text              TEXT        NOT NULL CHECK (length(text) BETWEEN 20 AND 4000),
  source_kind       TEXT        NOT NULL
                                CHECK (source_kind IN ('concept_definition', 'theory_block', 'manual_teacher')),
  -- 'concept_definition' : mirrored from concepts.source_quote (auto on ingestion)
  -- 'theory_block'       : mirrored from theory_blocks.source_quote (auto on ingestion)
  -- 'manual_teacher'     : prof-added annotation (paste d'un passage du cours
  --                         qu'on veut ré-injecter dans le tuteur socratique)
  source_ref        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- Pointer back to the originating row, for traceability + future de-dup :
  --   concept_definition : { concept_id }
  --   theory_block       : { theory_block_id, paragraph_ordinal }
  --   manual_teacher     : { note?: string }
  ingestion_job_id  UUID        REFERENCES public.ingestion_jobs(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_content_snippets_concept
  ON public.content_snippets(concept_id);

CREATE INDEX IF NOT EXISTS idx_content_snippets_school_kind
  ON public.content_snippets(school_id, source_kind);

-- Dedup partiel : on ne veut pas qu'une re-ingestion crée 2x le même extrait
-- pour un même concept. Pour les snippets auto (concept_definition,
-- theory_block) la combo (concept_id, source_kind, source_ref) doit être unique.
-- Les snippets manual_teacher ne sont PAS contraints par ça (un prof peut
-- coller plusieurs annotations sur le même concept).
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_snippets_auto_origin
  ON public.content_snippets(concept_id, source_kind, source_ref)
  WHERE source_kind IN ('concept_definition', 'theory_block');

ALTER TABLE public.content_snippets ENABLE ROW LEVEL SECURITY;

-- Reads : tenant-scoped (élèves + profs de l'école voient leurs snippets).
CREATE POLICY "content_snippets_tenant_read"
  ON public.content_snippets FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

-- Writes manual_teacher : profs uniquement, scoped à leur school.
-- Les snippets auto (concept_definition, theory_block) sont insérés
-- exclusivement par l'orchestrator (service_role), donc bloqués ici.
CREATE POLICY "content_snippets_teacher_insert_manual"
  ON public.content_snippets FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_user_school_id()
    AND public.is_current_user_school_teacher()
    AND source_kind = 'manual_teacher'
  );

CREATE POLICY "content_snippets_teacher_update_manual"
  ON public.content_snippets FOR UPDATE TO authenticated
  USING (
    school_id = public.current_user_school_id()
    AND public.is_current_user_school_teacher()
    AND source_kind = 'manual_teacher'
  )
  WITH CHECK (
    school_id = public.current_user_school_id()
    AND source_kind = 'manual_teacher'
  );

CREATE POLICY "content_snippets_teacher_delete_manual"
  ON public.content_snippets FOR DELETE TO authenticated
  USING (
    school_id = public.current_user_school_id()
    AND public.is_current_user_school_teacher()
    AND source_kind = 'manual_teacher'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill one-shot : peuple content_snippets depuis l'existant
-- (concepts.source_quote + theory_blocks.source_quote) pour que A.3 (tuteur
-- socratique) ait de la matière dès le merge, sans nouvelle ingestion.
--
-- ON CONFLICT DO NOTHING : si la migration est rejouée (jamais en prod, mais
-- safe en dev), pas de duplicates grâce à uq_content_snippets_auto_origin.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.content_snippets (concept_id, school_id, text, source_kind, source_ref, created_at)
SELECT
  c.id AS concept_id,
  c.school_id,
  c.source_quote AS text,
  'concept_definition' AS source_kind,
  jsonb_build_object('concept_id', c.id) AS source_ref,
  c.created_at
FROM public.concepts c
WHERE c.source_quote IS NOT NULL
  AND length(c.source_quote) BETWEEN 20 AND 4000
ON CONFLICT DO NOTHING;

INSERT INTO public.content_snippets (concept_id, school_id, text, source_kind, source_ref, ingestion_job_id, created_at)
SELECT
  tb.concept_id,
  tb.school_id,
  tb.source_quote AS text,
  'theory_block' AS source_kind,
  jsonb_build_object('theory_block_id', tb.id, 'paragraph_ordinal', tb.paragraph_ordinal) AS source_ref,
  tb.ingestion_job_id,
  tb.created_at
FROM public.theory_blocks tb
WHERE tb.source_quote IS NOT NULL
  AND length(tb.source_quote) BETWEEN 20 AND 4000
ON CONFLICT DO NOTHING;

COMMIT;
