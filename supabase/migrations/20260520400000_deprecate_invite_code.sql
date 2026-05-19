-- Sprint 6 PR S6-10 — Deprecate classes.invite_code (legacy 6 chars)
--
-- Contexte : 2 systèmes coexistaient en DB :
--   - classes.invite_code (TEXT NOT NULL UNIQUE, 6 chars) — historique
--   - classes.invitation_code (TEXT UNIQUE, 8 chars) — récent (mai 2026)
--
-- L'UI prof/élève bascule sur `invitation_code` (8 chars) car :
--   - Unifié avec QR code + page invitation dédiée
--   - Plus de surface anti-bruteforce (8 chars > 6)
--   - `/api/join` + `/api/join/preview` déjà branchés dessus
--
-- Cette migration ne DROP PAS la colonne (risque pre-pilote + NOT NULL
-- contrainte sur INSERT). Elle se contente d'ajouter un COMMENT explicite.
-- Le DROP sera fait Sprint 7+ post-pilote après garantir 0 usage residuel
-- (audit grep + soft-deprecate via API logs).

BEGIN;

COMMENT ON COLUMN public.classes.invite_code IS
  'DEPRECATED (Sprint 6 S6-10) — legacy 6-char code. UI bascule sur invitation_code (8 chars). DROP prévu Sprint 7+ post-pilote. Garde pour rétro-compat des API legacy `/api/classes/validate-code` etc.';

COMMENT ON COLUMN public.classes.invitation_code IS
  'Code d''invitation 8 chars unifié (Sprint 6 S6-10). Utilisé par /join, /api/join, page invitation QR. Remplacement de invite_code (deprecated).';

COMMIT;
