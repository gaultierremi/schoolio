-- Restore Mission Control (admin kanban board + agent_status).
--
-- Sprint 0 T11 dropped these tables (admin_board_cards, agent_status) per the
-- "out of MVP scope" framing. Alex decided to bring it back for internal team
-- tracking — useful even if not a pedagogical product surface.
--
-- Schema mirrors the original migrations
--   - 20260506000000_create_admin_board_cards.sql
--   - 20260514000000_create_agent_status.sql
-- but consolidated into one file since this is the explicit restore step.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- admin_board_cards : kanban cards (5 statuses, 4 priorities, 5 types)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_board_cards (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   TEXT        NOT NULL,
  type         TEXT        NOT NULL CHECK (type IN ('bug', 'feature', 'idea', 'comment', 'task')),
  title        TEXT        NOT NULL,
  description  TEXT,
  priority     TEXT        NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status       TEXT        NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'in_progress', 'review', 'done', 'archived')),
  assigned_to  TEXT,
  tags         TEXT[]      DEFAULT ARRAY[]::TEXT[],
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS admin_board_cards_status_idx ON public.admin_board_cards(status);
CREATE INDEX IF NOT EXISTS admin_board_cards_created_by_idx ON public.admin_board_cards(created_by);
CREATE INDEX IF NOT EXISTS admin_board_cards_priority_idx ON public.admin_board_cards(priority);
CREATE INDEX IF NOT EXISTS admin_board_cards_created_at_idx ON public.admin_board_cards(created_at DESC);

ALTER TABLE public.admin_board_cards ENABLE ROW LEVEL SECURITY;
-- No public policy : all access via admin API routes with service_role + ADMIN_EMAILS gate.

-- Trigger : auto-bump updated_at, manage completed_at on done transitions.
-- SECURITY DEFINER + SET search_path = '' per CLAUDE.md rule 12.
CREATE OR REPLACE FUNCTION public.update_admin_board_cards_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    NEW.completed_at = NOW();
  END IF;
  IF NEW.status != 'done' AND OLD.status = 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_board_cards_updated_at_trigger ON public.admin_board_cards;
CREATE TRIGGER admin_board_cards_updated_at_trigger
  BEFORE UPDATE ON public.admin_board_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_admin_board_cards_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- agent_status : live state of the AI agents (Claudy, Coco, Claudia, Jules)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_status (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL UNIQUE,
  emoji        TEXT        NOT NULL DEFAULT '🤖',
  status       TEXT        NOT NULL DEFAULT 'idle'
                           CHECK (status IN ('working', 'planning', 'blocked', 'idle', 'done')),
  current_task TEXT,
  branch       TEXT,
  eta          TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.agent_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_status_select_authenticated"
  ON public.agent_status FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "agent_status_insert_blocked"
  ON public.agent_status FOR INSERT
  TO authenticated
  WITH CHECK (FALSE);

CREATE POLICY "agent_status_update_blocked"
  ON public.agent_status FOR UPDATE
  TO authenticated
  USING (FALSE);

CREATE POLICY "agent_status_delete_blocked"
  ON public.agent_status FOR DELETE
  TO authenticated
  USING (FALSE);

COMMIT;
