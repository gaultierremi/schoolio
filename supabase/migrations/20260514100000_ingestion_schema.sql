-- Sprint 1 — Ingestion pipeline schema (theory + jobs)
-- Sprint 1.5 will add questions, distractors, step_solutions, misconceptions, hint_templates.

BEGIN;

-- 1. ingestion_jobs : tracks pipeline runs
CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  program_id UUID NOT NULL REFERENCES public.curriculum_programs(id) ON DELETE RESTRICT,
  pdf_storage_path TEXT NOT NULL,
  pdf_sha256 TEXT NOT NULL CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'extracting', 'chunking', 'batching', 'storing', 'done', 'failed')),
  triggered_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  batch_id TEXT,   -- Anthropic batch ID for polling
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_school_status
  ON public.ingestion_jobs(school_id, status);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_program
  ON public.ingestion_jobs(program_id);

ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;

-- Teachers can read jobs from their school.
CREATE POLICY "ingestion_jobs_tenant_read"
  ON public.ingestion_jobs FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

-- Inserts and updates only via service role (orchestrator runs server-side).
CREATE POLICY "ingestion_jobs_no_writes"
  ON public.ingestion_jobs FOR INSERT TO authenticated
  WITH CHECK (FALSE);

-- 2. theory_blocks : 4-paragraph theory per concept (Sprint 1 output)
CREATE TABLE IF NOT EXISTS public.theory_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  paragraph_ordinal INT NOT NULL CHECK (paragraph_ordinal BETWEEN 1 AND 10),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  source_quote TEXT,
  source_concept_path TEXT,
  ingestion_job_id UUID REFERENCES public.ingestion_jobs(id) ON DELETE SET NULL,
  needs_teacher_review BOOLEAN NOT NULL DEFAULT TRUE,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(concept_id, paragraph_ordinal),
  CHECK (source_quote IS NOT NULL OR source_concept_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_theory_blocks_concept
  ON public.theory_blocks(concept_id);
CREATE INDEX IF NOT EXISTS idx_theory_blocks_school_review
  ON public.theory_blocks(school_id) WHERE needs_teacher_review = TRUE;

ALTER TABLE public.theory_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "theory_blocks_tenant_scope"
  ON public.theory_blocks FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());

COMMIT;
