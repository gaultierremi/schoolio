-- Sprint 6 PR S6-8 — Préférences d'accessibilité dans user_profiles
--
-- Why : élève dyslexique doit pouvoir activer la font OpenDyslexic (mémoire
-- `backlog_pre_pilote` : "OpenDyslexic font option (quand student coche
-- dyslexique dans son profil)").
--
-- Approche minimale : 1 colonne BOOLEAN dans user_profiles plutôt qu'une
-- table dédiée (1-to-1, lecture frequente avec le profile). On garde la
-- table user_profiles comme source de vérité des prefs UX.
--
-- Règles CLAUDE.md :
-- - #8 RLS deja active sur user_profiles
-- - #10 BOOLEAN NOT NULL DEFAULT FALSE = explicit, pas de NULL ambigu
-- - Pas de FK/trigger à ajouter

BEGIN;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS prefers_dyslexic_font BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.user_profiles.prefers_dyslexic_font IS
  'Sprint 6 PR S6-8 — Si TRUE, applique font OpenDyslexic dans l''UI via attribut data-dyslexic="true" sur <html>.';

COMMIT;
