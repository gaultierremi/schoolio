-- Add viewport state for full react-pdf sync (scroll position + zoom level)
ALTER TABLE live_sessions
  ADD COLUMN scroll_y FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN zoom     FLOAT NOT NULL DEFAULT 1.0;
