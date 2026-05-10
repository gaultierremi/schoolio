-- AI Router: provider quotas, request logs, response cache

CREATE TABLE ai_provider_quotas (
  id             TEXT        PRIMARY KEY,
  display_name   TEXT        NOT NULL,
  requests_today INT         NOT NULL DEFAULT 0,
  daily_limit    INT         NOT NULL,
  cooldown_until TIMESTAMPTZ,
  last_reset_at  DATE        NOT NULL DEFAULT CURRENT_DATE,
  eu_compliant   BOOLEAN     NOT NULL DEFAULT false,
  priority       INT         NOT NULL DEFAULT 50,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_request_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   TEXT        REFERENCES ai_provider_quotas(id),
  task_type     TEXT        NOT NULL,
  prompt_hash   TEXT,
  tokens_used   INT,
  latency_ms    INT,
  status        TEXT        NOT NULL CHECK (status IN ('success','error','quota_exceeded','cached')),
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_response_cache (
  prompt_hash   TEXT        PRIMARY KEY,
  task_type     TEXT        NOT NULL,
  response_text TEXT        NOT NULL,
  hit_count     INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX ai_request_logs_created_at_idx ON ai_request_logs (created_at DESC);
CREATE INDEX ai_request_logs_provider_idx   ON ai_request_logs (provider_id);
CREATE INDEX ai_response_cache_expires_idx  ON ai_response_cache (expires_at);

-- Seed providers in priority order (lower priority = tried first)
INSERT INTO ai_provider_quotas (id, display_name, daily_limit, eu_compliant, priority) VALUES
  ('gemini_pro',      'Gemini 2.5 Pro',              50,    true,  10),
  ('gemini_flash',    'Gemini 2.5 Flash',            500,   true,  20),
  ('mistral_large',   'Mistral Large',               100,   true,  30),
  ('cerebras_llama',  'Cerebras Llama 3.1 70B',     1000,  false,  40),
  ('groq_llama',      'Groq Llama 3.1 70B',          500,  false,  50),
  ('groq_gemma',      'Groq Gemma2 9B',             1000,  false,  55),
  ('sambanova_llama', 'SambaNova Llama 3.1 405B',    500,  false,  60),
  ('openrouter_free', 'OpenRouter (free tier)',       200,  false,  70),
  ('cloudflare_ai',   'Cloudflare Workers AI',      10000, false,  80);

-- service_role bypasses RLS; anon/authenticated cannot access these tables
ALTER TABLE ai_provider_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_request_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_response_cache  ENABLE ROW LEVEL SECURITY;
