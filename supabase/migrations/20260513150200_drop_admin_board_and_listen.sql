-- Sprint 0 — Drop Mission Control + Schoolio Listen tables (out of MVP scope per spec §2.2)

BEGIN;

DROP TABLE IF EXISTS public.admin_board_cards CASCADE;
DROP TABLE IF EXISTS public.agent_status CASCADE;
-- ai_listen_logs may or may not exist depending on migration history; CASCADE safely
DROP TABLE IF EXISTS public.ai_listen_logs CASCADE;

-- Remove listening_active column from live_sessions if present
ALTER TABLE IF EXISTS public.live_sessions
  DROP COLUMN IF EXISTS listening_active,
  DROP COLUMN IF EXISTS ai_listen_origin;

COMMIT;
