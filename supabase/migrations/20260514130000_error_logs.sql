-- Error observability for dogfood phase — Supabase-native instead of Sentry.
--
-- Why : during Sprint 1 we hit 7 consecutive hotfixes (e.replace, o is not a
-- function, etc.) because error_message TEXT in ingestion_jobs only captures
-- err.message — no stack trace, no context, no breadcrumbs. Debug velocity
-- was bottlenecked on Alex screenshotting cryptic messages.
--
-- This table is the source of truth for any caught error in route handlers,
-- the orchestrator, or background jobs. Full stack + JSONB context + linkage
-- to the user/school/job that triggered it.
--
-- Sentry can come later if we ever outgrow this. For now : zero external dep,
-- one table, queryable via SQL or a future /admin/errors page.

BEGIN;

CREATE TABLE IF NOT EXISTS public.error_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  severity     TEXT        NOT NULL DEFAULT 'error'
                           CHECK (severity IN ('debug', 'info', 'warn', 'error', 'fatal')),
  source       TEXT        NOT NULL CHECK (length(source) BETWEEN 1 AND 100),
  -- 'source' is a stable identifier of the call site, e.g.:
  --   "orchestrator.runIngestion", "api.ingestion.trigger.POST",
  --   "api.syllabus.upload.POST", "lib.pdf.extract-markdown"
  message      TEXT        NOT NULL,
  -- err.message — short summary, what Alex sees in the UI today.
  stack        TEXT,
  -- err.stack — full trace, the thing that was missing during Sprint 1 debug.
  context      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- Arbitrary structured context : { job_id, school_id, user_id, request_id,
  -- node_version, ... }. Always include the minimum that pinpoints the failing
  -- request — job_id for ingestion, request_id for routes.
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  school_id    UUID        REFERENCES public.schools(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_error_logs_occurred_at ON public.error_logs(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_source ON public.error_logs(source);
CREATE INDEX IF NOT EXISTS idx_error_logs_school ON public.error_logs(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_error_logs_severity_recent
  ON public.error_logs(severity, occurred_at DESC)
  WHERE severity IN ('error', 'fatal');

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Reads : authenticated admins only (gating done at the route level via
-- ADMIN_EMAILS — RLS here is defense-in-depth, blocking SELECT from any other
-- authenticated context).
CREATE POLICY "error_logs_admin_read_block"
  ON public.error_logs FOR SELECT TO authenticated
  USING (FALSE);

-- No client writes ever — only service_role inserts (called by logError() lib).
CREATE POLICY "error_logs_no_anon_writes"
  ON public.error_logs FOR INSERT TO authenticated
  WITH CHECK (FALSE);

COMMIT;
