-- Sprint 1B — Table anonymized_users : suppression de compte sans destruction
-- des tables événementielles (règle interne #23 CLAUDE.md).
--
-- Architecture (cf. plan Sprint 1A critique #2) :
-- - Au lieu d'UPDATE N×10000 rows événementielles (assignment_question_answers,
--   class_memberships, quiz_completions, live_session_answers, mastery, etc.)
--   on fait 1 seul INSERT dans anonymized_users avec le user_id à anonymiser.
-- - Les vues / queries qui retournent le nom de l'utilisateur joignent sur
--   cette table : si match → substituer par "Utilisateur supprimé".
-- - La FK student_user_id → auth.users(id) ON DELETE CASCADE doit être
--   préservée sur les tables événementielles (ne PAS la supprimer), mais on
--   ne supprime PAS la row auth.users du user "deleted" — on le force juste
--   à signOut + on retire ses PII de user_profiles + on log audit ACCOUNT_ANONYMIZED.
-- - Le user_id reste valide en DB. Le user ne peut juste plus se re-loger
--   (auth.users.email mis à un placeholder, password disabled, app_metadata
--   vidé). Si un nouveau login Google avec le même email arrive : Supabase
--   créera un NOUVEAU user_id, pas le même.

BEGIN;

CREATE TABLE IF NOT EXISTS public.anonymized_users (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymized_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- raison libre (optionnel) — saisi par le user à la suppression
  reason          TEXT,
  -- snapshot des classes au moment de la suppression (utile pour debug pédago)
  class_ids       UUID[] NOT NULL DEFAULT ARRAY[]::UUID[]
);

COMMENT ON TABLE public.anonymized_users IS
  'Sprint 1B (RGPD Art. 17) : user_id ayant demandé la suppression. Les tables événementielles continuent à porter ce user_id mais les vues + queries qui exposent le nom utilisent un JOIN sur cette table et substituent par "Utilisateur supprimé". Aucun DELETE sur événementiel (règle interne #23).';

CREATE INDEX IF NOT EXISTS anonymized_users_at_idx
  ON public.anonymized_users (anonymized_at DESC);

ALTER TABLE public.anonymized_users ENABLE ROW LEVEL SECURITY;

-- Lecture : autorisée à tous les authenticated (utile pour les vues frontend
-- qui veulent afficher "Utilisateur supprimé" sans faire un appel admin).
-- Aucun PII dans cette table par construction : juste user_id + timestamp.
CREATE POLICY "anonymized_users_public_read"
  ON public.anonymized_users FOR SELECT TO authenticated
  USING (TRUE);

-- Écriture : interdite côté client. Insert via service role uniquement
-- (API /api/parametres/delete-account).
CREATE POLICY "anonymized_users_no_client_writes"
  ON public.anonymized_users FOR ALL TO authenticated
  USING (FALSE) WITH CHECK (FALSE);

-- ── Helper : check rapide si un user est anonymisé ────────────────────────
-- Utilisable depuis le code applicatif via supabase.rpc('is_user_anonymized', {uid}).
CREATE OR REPLACE FUNCTION public.is_user_anonymized(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.anonymized_users WHERE user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION public.is_user_anonymized IS
  'Check rapide si un user_id a demandé la suppression de son compte. Utilisé par les vues frontend pour afficher "Utilisateur supprimé".';

COMMIT;
