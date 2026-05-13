-- Sprint 0 — T17: Curriculum foundation + Schoolio mastery legacy rename
--
-- Two coordinated changes in one transaction:
--
-- 1. Rename the 3 legacy Schoolio concept-mastery tables (concepts,
--    user_concept_mastery, question_concepts) to *_legacy_schoolio. Data is
--    preserved (198 + 46 + 0 rows) for potential Sprint 1 curriculum mining.
--    The Schoolio code that called these tables is deleted in this same PR
--    (lib/concepts.ts, lib/adaptive.ts, lib/recommendations.ts, app/study/*,
--    app/train/*, etc.) — replaced by Maïa's Banks Socratiques + curriculum
--    pipeline (spec §1, §4.3).
--
-- 2. Create Maïa's curriculum_programs, uaa, concepts tables — the
--    foundation for the Sprint 1 ingestion pipeline (PDF → markdown → chunking
--    by UAA → batch Claude → DB). Provenance fields (source_quote,
--    source_concept_path) are non-negotiable per spec §5 + smoke test Histoire
--    learnings.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 1: Rename legacy Schoolio mastery tables
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.a — concepts → concepts_legacy_schoolio
ALTER TABLE public.concepts RENAME TO concepts_legacy_schoolio;
ALTER TABLE public.concepts_legacy_schoolio RENAME CONSTRAINT concepts_pkey TO concepts_legacy_schoolio_pkey;
ALTER TABLE public.concepts_legacy_schoolio RENAME CONSTRAINT concepts_parent_id_fkey TO concepts_legacy_schoolio_parent_id_fkey;
ALTER TABLE public.concepts_legacy_schoolio RENAME CONSTRAINT concepts_level_check TO concepts_legacy_schoolio_level_check;
ALTER INDEX public.idx_concepts_subject_enum_level RENAME TO idx_concepts_legacy_schoolio_subject_enum_level;
DROP POLICY IF EXISTS "Concepts insérables par authentifiés" ON public.concepts_legacy_schoolio;
DROP POLICY IF EXISTS "Concepts lisibles par tous" ON public.concepts_legacy_schoolio;

-- 1.b — user_concept_mastery → user_concept_mastery_legacy_schoolio
ALTER TABLE public.user_concept_mastery RENAME TO user_concept_mastery_legacy_schoolio;
ALTER TABLE public.user_concept_mastery_legacy_schoolio RENAME CONSTRAINT user_concept_mastery_pkey TO user_concept_mastery_legacy_schoolio_pkey;
ALTER TABLE public.user_concept_mastery_legacy_schoolio RENAME CONSTRAINT user_concept_mastery_user_id_concept_id_key TO user_concept_mastery_legacy_schoolio_user_id_concept_id_key;
ALTER TABLE public.user_concept_mastery_legacy_schoolio RENAME CONSTRAINT user_concept_mastery_concept_id_fkey TO user_concept_mastery_legacy_schoolio_concept_id_fkey;
ALTER TABLE public.user_concept_mastery_legacy_schoolio RENAME CONSTRAINT user_concept_mastery_user_id_fkey TO user_concept_mastery_legacy_schoolio_user_id_fkey;
ALTER TABLE public.user_concept_mastery_legacy_schoolio RENAME CONSTRAINT user_concept_mastery_mastery_score_check TO user_concept_mastery_legacy_schoolio_mastery_score_check;
ALTER INDEX public.user_concept_mastery_next_review_idx RENAME TO user_concept_mastery_legacy_schoolio_next_review_idx;
DROP POLICY IF EXISTS "Mastery insérables par propriétaire" ON public.user_concept_mastery_legacy_schoolio;
DROP POLICY IF EXISTS "Mastery lisible par propriétaire" ON public.user_concept_mastery_legacy_schoolio;
DROP POLICY IF EXISTS "Mastery modifiable par propriétaire" ON public.user_concept_mastery_legacy_schoolio;

-- 1.c — question_concepts → question_concepts_legacy_schoolio
ALTER TABLE public.question_concepts RENAME TO question_concepts_legacy_schoolio;
ALTER TABLE public.question_concepts_legacy_schoolio RENAME CONSTRAINT question_concepts_pkey TO question_concepts_legacy_schoolio_pkey;
ALTER TABLE public.question_concepts_legacy_schoolio RENAME CONSTRAINT question_concepts_concept_id_fkey TO question_concepts_legacy_schoolio_concept_id_fkey;
ALTER TABLE public.question_concepts_legacy_schoolio RENAME CONSTRAINT question_concepts_question_type_check TO question_concepts_legacy_schoolio_question_type_check;
DROP POLICY IF EXISTS "Question concepts insérables" ON public.question_concepts_legacy_schoolio;
DROP POLICY IF EXISTS "Question concepts lisibles" ON public.question_concepts_legacy_schoolio;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 2: Create Maïa curriculum + concepts tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.curriculum_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  region TEXT,
  level TEXT NOT NULL CHECK (length(level) BETWEEN 1 AND 50),
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 50),
  program_version TEXT NOT NULL CHECK (length(program_version) BETWEEN 1 AND 100),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(country, region, level, subject, program_version)
);

CREATE TABLE IF NOT EXISTS public.uaa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.curriculum_programs(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (length(code) BETWEEN 1 AND 30),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 300),
  ordinal INT NOT NULL CHECK (ordinal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(program_id, code)
);

CREATE INDEX IF NOT EXISTS idx_uaa_program ON public.uaa(program_id);

CREATE TABLE IF NOT EXISTS public.concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.curriculum_programs(id) ON DELETE CASCADE,
  uaa_id UUID REFERENCES public.uaa(id) ON DELETE SET NULL,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9-]{1,150}$'),
  description TEXT,
  source_quote TEXT,
  source_concept_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(school_id, program_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_concepts_school_program ON public.concepts(school_id, program_id);
CREATE INDEX IF NOT EXISTS idx_concepts_uaa ON public.concepts(uaa_id) WHERE uaa_id IS NOT NULL;

ALTER TABLE public.curriculum_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uaa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "curriculum_programs_read_all"
  ON public.curriculum_programs FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "uaa_read_all"
  ON public.uaa FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "concepts_tenant_scope"
  ON public.concepts FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());

COMMIT;
