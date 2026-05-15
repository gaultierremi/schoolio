-- Sprint 1A — consent_records : trace immuable des consentements RGPD signés.
--
-- Architecture (cf. mémoire project_consent_parental_minor + plan Sprint 1A) :
-- - 1 row par consentement signé. Adulte = auto-signature avec parent_email_hash NULL.
--   Mineur (Sprint 1B) = parent signe via token, parent_email_hash rempli, JAMAIS l'email en clair.
-- - L'email parent est hashé bcrypt cost 10 côté API au moment de l'envoi du lien,
--   puis l'API supprime la valeur clear de sa mémoire. Le serveur ne stocke jamais
--   l'email parent en clair (mémoire project_consent_parental_minor).
-- - signature_token_hash = SHA-256 du token UUIDv4 généré pour le lien de signature parent.
--   SHA-256 (déterministe) permet le lookup côté API par hash, alors que bcrypt non indexable.
--   Le token UUIDv4 reste unguessable même si SHA-256 n'est pas one-way "fort".
-- - Sprint 1A : seuls les adultes utilisent cette table (parent_email_hash NULL).
-- - Sprint 1B : workflow mineur active parent_email_hash + signature_token_hash + expires_at + signed_ip_hash.

BEGIN;

CREATE TABLE IF NOT EXISTS public.consent_records (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Optionnel : seulement rempli pour le workflow parent mineur (Sprint 1B)
  parent_email_hash        TEXT,
  signature_token_hash     TEXT,

  -- Signature : NULL = en attente (mineur waiting parent), NOT NULL = signé
  signed_at                TIMESTAMPTZ,
  signed_ip_hash           TEXT,
  signer_name_hash         TEXT,         -- bcrypt du nom signataire (parent ou self adulte)

  -- Sprint 1B : token de signature parent expire 72h après émission
  expires_at               TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '99 years'),

  -- Révocation (Sprint 1B) — Art. 7(3) RGPD
  revoked_at               TIMESTAMPTZ,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Sanity : expires au moins 1h après création
  CONSTRAINT consent_records_expires_after_created
    CHECK (expires_at > created_at + INTERVAL '1 hour')
);

COMMENT ON TABLE public.consent_records IS
  'Trace immuable des consentements RGPD. Sprint 1A : adultes (parent_email_hash NULL). Sprint 1B : workflow mineur via signature parent token-based. JAMAIS d''email parent en clair.';
COMMENT ON COLUMN public.consent_records.parent_email_hash IS
  'bcrypt cost 10 de l''email parent. NULL pour adultes auto-signés.';
COMMENT ON COLUMN public.consent_records.signature_token_hash IS
  'SHA-256 du token UUIDv4 envoyé au parent par email. Permet le lookup au moment de la signature. NULL pour adultes.';
COMMENT ON COLUMN public.consent_records.signed_at IS
  'NULL = en attente (mineur). NOT NULL = signé (adulte ou parent).';
COMMENT ON COLUMN public.consent_records.revoked_at IS
  'Art. 7(3) RGPD : droit de retirer son consentement à tout moment. Sprint 1B.';

-- Index : un user a un seul consent VALIDE à la fois (non révoqué + signé)
CREATE UNIQUE INDEX IF NOT EXISTS consent_records_active_unique
  ON public.consent_records (student_user_id)
  WHERE signed_at IS NOT NULL AND revoked_at IS NULL;

-- Index lookup par token hash (Sprint 1B workflow parent)
CREATE INDEX IF NOT EXISTS consent_records_token_hash_idx
  ON public.consent_records (signature_token_hash)
  WHERE signature_token_hash IS NOT NULL;

-- Index par user pour les listes (parametres/confidentialite)
CREATE INDEX IF NOT EXISTS consent_records_student_idx
  ON public.consent_records (student_user_id, created_at DESC);

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

-- Lecture : un user voit SES propres consents (transparence RGPD Art. 15).
CREATE POLICY "consent_records_self_read"
  ON public.consent_records FOR SELECT TO authenticated
  USING (student_user_id = auth.uid());

-- Écriture : interdite côté client. Append-only via service role aux API routes.
CREATE POLICY "consent_records_no_client_writes"
  ON public.consent_records FOR ALL TO authenticated
  USING (FALSE) WITH CHECK (FALSE);

COMMIT;
