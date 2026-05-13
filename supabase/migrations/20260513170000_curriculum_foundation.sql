-- Sprint 0 — T17: Curriculum + concepts foundation tables
-- Populated by the Sprint 1 ingestion pipeline (PDF → markdown → chunking by UAA
-- → batch Claude → DB). Provenance fields (source_quote, source_concept_path) are
-- non-negotiable per spec §5 + smoke test Histoire findings (Q9 1945 glissement).

BEGIN;

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

-- Programs and UAAs are public reference (FW-B official curricula) — read by all authenticated.
-- Writes only via service role (no INSERT/UPDATE/DELETE policy for authenticated = blocked by default).
CREATE POLICY "curriculum_programs_read_all"
  ON public.curriculum_programs FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "uaa_read_all"
  ON public.uaa FOR SELECT TO authenticated
  USING (TRUE);

-- Concepts are tenant-scoped: a teacher only sees concepts belonging to their school.
CREATE POLICY "concepts_tenant_scope"
  ON public.concepts FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());

COMMIT;
