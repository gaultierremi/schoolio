-- Add listening state to live_sessions for "Schoolio écoute" transparency.
--
-- listening_active: true while the teacher has the microphone open.
--   SET to true via POST /api/live-sessions/[id]/listen-toggle { active: true }.
--   SET to false on toggle-off, on session end, and lazily when heartbeat is stale.
--   Propagated via existing Realtime subscription to the slave (badge display).
--
-- listening_heartbeat_at: refreshed every ~10 s while the teacher is listening.
--   Used client-side by the slave: if NOW() - heartbeat > 15 s, the badge is
--   hidden locally to reflect that the mic connection was lost (network drop,
--   mic mute, tab switch) — without requiring a server-side pg_cron cleanup.
ALTER TABLE live_sessions
  ADD COLUMN listening_active       BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN listening_heartbeat_at TIMESTAMPTZ NULL;
