-- Sprint 1A — PIN auth secondaire pour double-auth SSO+PIN.
--
-- Architecture (cf. mémoire project_pin_auth_spec + plan Sprint 1A) :
-- - PIN 4 chiffres bcrypt cost 12, un seul PIN partagé cross-device par user
-- - Timezone user stockée pour calcul "prochain matin" (re-auth quotidienne)
-- - Fallback SSO après 3 échecs (la logique vit côté API, ce schéma stocke le compteur)
-- - PIN re-auth gérée via cookie HttpOnly signé JWT (lib/auth/pin-cookie.ts),
--   pas via comparaison de timestamps en middleware → 0 DB hit après le unlock
-- - pin_attempts = audit log append-only des tentatives, pour analytics + audit RGPD
--
-- RLS stricte : aucune écriture côté anon, lecture restreinte au user lui-même.

BEGIN;

-- ── user_pin : un PIN courant par utilisateur ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_pin (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash         TEXT NOT NULL,
  last_unlock_at   TIMESTAMPTZ,
  failed_attempts  INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  user_timezone    TEXT NOT NULL DEFAULT 'Europe/Brussels',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_pin IS
  'PIN auth secondaire (Sprint 1A). Cf. mémoire project_pin_auth_spec. Toute écriture passe par service role, jamais directement par le client.';
COMMENT ON COLUMN public.user_pin.pin_hash IS
  'bcrypt cost 12 du PIN à 4 chiffres. JAMAIS le PIN en clair.';
COMMENT ON COLUMN public.user_pin.user_timezone IS
  'IANA timezone name (Europe/Brussels, Europe/Paris, ...) pour calculer "prochain matin" cross-fuseaux.';

ALTER TABLE public.user_pin ENABLE ROW LEVEL SECURITY;

-- Lecture : un user peut lire SON propre row (utile pour afficher "PIN setup ? oui/non" côté UI).
CREATE POLICY "user_pin_self_read"
  ON public.user_pin FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Écriture : interdite côté anon ET authenticated. Toutes les mutations passent par
-- les API routes server-side avec le service role client (SUPABASE_SERVICE_ROLE_KEY).
CREATE POLICY "user_pin_no_client_writes"
  ON public.user_pin FOR ALL TO authenticated
  USING (FALSE) WITH CHECK (FALSE);

-- Trigger : auto-bump updated_at sur UPDATE. SECURITY DEFINER + SET search_path = ''
-- (règle interne #12 CLAUDE.md — anti-escalation Supabase linter).
CREATE OR REPLACE FUNCTION public.bump_user_pin_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_pin_bump_updated_at ON public.user_pin;
CREATE TRIGGER user_pin_bump_updated_at
  BEFORE UPDATE ON public.user_pin
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_user_pin_updated_at();

-- ── pin_attempts : audit log append-only des tentatives ──────────────────────
CREATE TABLE IF NOT EXISTS public.pin_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  success       BOOLEAN NOT NULL,
  ip_hash       TEXT,
  user_agent    TEXT,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.pin_attempts IS
  'Audit append-only des tentatives PIN (Sprint 1A). IP et user-agent hashés via SHA-256 côté API. Conservé 5 ans (purge cron post-MVP).';
COMMENT ON COLUMN public.pin_attempts.ip_hash IS
  'SHA-256 de l''IP source. Permet detection patterns sans stocker l''IP en clair.';

CREATE INDEX IF NOT EXISTS pin_attempts_user_attempted_idx
  ON public.pin_attempts (user_id, attempted_at DESC);

ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;

-- Lecture : un user peut consulter SES propres tentatives (transparence RGPD Art. 15).
CREATE POLICY "pin_attempts_self_read"
  ON public.pin_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Écriture : interdite côté client. Append-only via service role.
CREATE POLICY "pin_attempts_no_client_writes"
  ON public.pin_attempts FOR ALL TO authenticated
  USING (FALSE) WITH CHECK (FALSE);

COMMIT;
