-- Side Sprint Prof — Ajout Anthropic Claude au router AI
--
-- Pourquoi : Gemini Free Tier hit quota_exceeded apres ~50 requetes (gemini_pro)
-- ou ~500 (gemini_flash). Sans fallback Vision-capable, generate-questions
-- echoue silencieusement (0 questions). Anthropic Claude Sonnet 4.5 supporte
-- la Vision PDF nativement via Files API base64, pay-as-you-go (€20 deja
-- charge sur la cle ANTHROPIC_API_KEY).
--
-- Priorite 5 = devient le 1er choix avant les Gemini. Choix discutable :
-- Gemini Free est gratuit (limite par quota), Anthropic est paid. Si le
-- but est de minimiser le cout, mettre priority 15 (apres gemini_pro=10
-- et gemini_flash=20). Si le but est la qualite + robustesse, priority 5
-- est meilleur. On choisit 5 pour MVP dogfood (qualite > cout, €20 dure
-- bien plus longtemps que les quotas Gemini).
--
-- daily_limit 1000 = soft cap pour eviter de cramer le budget en cas de
-- bug runaway. A ajuster apres observation des consommations reelles.

BEGIN;

INSERT INTO public.ai_provider_quotas
  (id, display_name, priority, requests_today, daily_limit, cooldown_until, last_reset_at)
VALUES
  ('anthropic_claude', 'Anthropic Claude Sonnet 4.5', 5, 0, 1000, NULL, CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

COMMIT;
