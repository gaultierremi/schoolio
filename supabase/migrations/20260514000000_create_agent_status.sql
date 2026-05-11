-- ============================================================================
-- Mission Control — agent_status table.
--
-- WHY: Mission Control is a separate desktop overlay (D:\mission-control)
-- that displays the live state of the 4 AI agents (Claudy, Coco, Claudia,
-- Jules) working on Schoolio. This table is the single source of truth for
-- each agent's current status, task, branch, and ETA.
--
-- Design choices:
--   - name is UNIQUE so agents can be upserted by name without knowing their
--     UUID upfront.
--   - status is a strict enum; unknown states are rejected at the DB level.
--   - RLS: authenticated users can SELECT (all teachers/admins can read the
--     dashboard), but INSERT/UPDATE are blocked for authenticated — only
--     service_role (used by the admin API route) can write. This prevents
--     any authenticated user from spoofing agent state.
--   - Realtime is enabled so Mission Control receives live pushes without
--     polling.
-- ============================================================================

CREATE TABLE public.agent_status (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL UNIQUE,
  emoji        TEXT        NOT NULL DEFAULT '🤖',
  status       TEXT        NOT NULL DEFAULT 'idle'
                           CHECK (status IN ('working', 'planning', 'blocked', 'idle', 'done')),
  current_task TEXT        NULL,
  branch       TEXT        NULL,
  eta          TEXT        NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_status ENABLE ROW LEVEL SECURITY;

-- Authenticated users (teachers, admins) can read all agent statuses.
CREATE POLICY "agent_status_select_authenticated"
  ON public.agent_status FOR SELECT
  TO authenticated
  USING (true);

-- Writes are reserved for service_role (admin API route).
-- Blocking INSERT and UPDATE for authenticated prevents spoofing.
CREATE POLICY "agent_status_insert_blocked"
  ON public.agent_status FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "agent_status_update_blocked"
  ON public.agent_status FOR UPDATE
  TO authenticated
  USING (false);

-- Seed: initial idle state for all 4 agents.
INSERT INTO public.agent_status (name, emoji, status) VALUES
  ('Claudy',  '🎯', 'idle'),
  ('Coco',    '🤖', 'idle'),
  ('Claudia', '🧪', 'idle'),
  ('Jules',   '☁️', 'idle');

-- Enable Realtime so Mission Control receives live pushes without polling.
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_status;
