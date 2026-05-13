-- Sprint 0 — Multi-tenant foundation (T4)
-- Creates the schools table that every tenant-scoped table will FK into.
-- RLS is enabled with a permissive placeholder read policy; tightened in T6.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{1,80}$'),
  country TEXT NOT NULL DEFAULT 'BE' CHECK (country ~ '^[A-Z]{2}$'),
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_schools_slug ON public.schools(slug);
CREATE INDEX IF NOT EXISTS idx_schools_country_active ON public.schools(country) WHERE is_active = TRUE;

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- Placeholder: tightened in T6 (only see your own school).
CREATE POLICY "schools_read_authenticated_placeholder"
  ON public.schools FOR SELECT
  TO authenticated
  USING (TRUE);

COMMIT;
