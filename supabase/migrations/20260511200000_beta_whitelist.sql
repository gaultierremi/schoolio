-- Beta whitelist: who can access Schoolio during private beta
CREATE TABLE IF NOT EXISTS beta_whitelist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL,
  added_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes       TEXT,
  source      TEXT        NOT NULL DEFAULT 'manual'
);

CREATE UNIQUE INDEX idx_beta_whitelist_email_lower
  ON beta_whitelist (LOWER(email));

-- Access requests from non-whitelisted users
CREATE TABLE IF NOT EXISTS beta_access_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES auth.users(id),
  email        TEXT        NOT NULL,
  full_name    TEXT,
  message      TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID        REFERENCES auth.users(id)
);

CREATE INDEX idx_beta_requests_status
  ON beta_access_requests(status);
CREATE INDEX idx_beta_requests_email_lower
  ON beta_access_requests(LOWER(email));

-- RLS
ALTER TABLE beta_whitelist        ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_access_requests  ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS automatically (no policy needed)

-- Authenticated users can check if their own email is whitelisted
CREATE POLICY "user_can_see_own_whitelist_entry"
  ON beta_whitelist FOR SELECT
  TO authenticated
  USING (LOWER(email) = LOWER(auth.jwt() ->> 'email'));

-- Authenticated users can insert their own request
CREATE POLICY "user_can_insert_own_request"
  ON beta_access_requests FOR INSERT
  TO authenticated
  WITH CHECK (LOWER(email) = LOWER(auth.jwt() ->> 'email'));

-- Authenticated users can read their own request(s)
CREATE POLICY "user_can_see_own_requests"
  ON beta_access_requests FOR SELECT
  TO authenticated
  USING (LOWER(email) = LOWER(auth.jwt() ->> 'email'));

-- Seed: initial whitelist
INSERT INTO beta_whitelist (email, source) VALUES
  ('gaultierremi@gmail.com',     'manual'),
  ('alex.bourdouxhe@gmail.com',  'manual'),
  ('christophe.lecrenier@gmail.com', 'manual'),
  ('presti013@gmail.com',        'manual'),
  ('ajehaes@gmail.com',          'manual')
ON CONFLICT (LOWER(email)) DO NOTHING;
