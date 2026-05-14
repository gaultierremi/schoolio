-- Sprint 0.5 — founder_teachers whitelist for dogfood role assignment

BEGIN;

CREATE TABLE IF NOT EXISTS public.founder_teachers (
  email TEXT PRIMARY KEY CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

ALTER TABLE public.founder_teachers ENABLE ROW LEVEL SECURITY;

-- No client-side reads or writes. All access goes through server-side helpers
-- gated by SUPER_ADMIN_EMAILS in lib/admin-config.ts.
CREATE POLICY "founder_teachers_no_anon_no_authenticated"
  ON public.founder_teachers FOR ALL TO authenticated
  USING (FALSE) WITH CHECK (FALSE);

COMMIT;
