-- Porte unique d'assignabilité : is_active devient le seul état qui décide
-- qu'une question atteint un élève. Migration de SÉCURITÉ, pas de confort.
--
-- ── Pourquoi elle est obligatoire ────────────────────────────────────────────
--
-- Jusqu'ici, six filtres applicatifs exigeaient `validated_at NOT NULL` EN PLUS
-- de `is_active`. Ce double-gate piégeait le prof (l'onglet "Par concept", celui
-- par défaut, n'écrit qu'is_active → quiz refusé), mais il protégeait aussi PAR
-- ACCIDENT : `is_active` a le DEFAULT TRUE en production, donc toute question
-- sortie du pipeline IA naît active. Seule l'absence de `validated_at` la tenait
-- à l'écart des élèves.
--
-- Retirer `validated_at` du gate supprime ce garde-fou involontaire. Recensé le
-- 2026-09-13 : 986 questions actives jamais relues (982 générées par IA,
-- 4 extraites de PDF, ZÉRO saisie manuelle de prof — vérifié par requête avant
-- d'écrire cette migration). Sans le backfill ci-dessous, ces 986 deviendraient
-- diffusables à des élèves mineurs à la seconde du déploiement.
--
-- ── Pourquoi cet ordre, contre-intuitif ─────────────────────────────────────
--
-- On pose le DEFAULT AVANT le backfill, alors que l'intuition dit l'inverse.
-- Raison : `ALTER TABLE ... SET DEFAULT` prend un ACCESS EXCLUSIVE qui, dans une
-- transaction, est tenu jusqu'au COMMIT. Il bloque donc tout INSERT concurrent
-- pour le reste de la transaction, et l'UPDATE qui suit rattrape forcément tout
-- ce qui était committé avant. Aucune ligne ne peut naître active entre les deux
-- étapes.
--
-- L'ordre inverse (backfill puis default) laisse une fenêtre : une génération de
-- questions qui commit entre l'UPDATE et l'ALTER insère des lignes à TRUE que
-- plus rien ne rattrape.
--
-- ⚠️ Ce motif n'est tenable QUE parce que la table est petite (~1200 lignes).
-- L'ACCESS EXCLUSIVE bloque aussi les LECTURES : à l'échelle du million de
-- lignes, tenir ce lock pendant un UPDATE serait une coupure de service.
-- NE PAS recopier ce motif sur une grosse table.
--
-- ── Note sur l'état de départ ───────────────────────────────────────────────
--
-- Deux migrations ajoutent `is_active` avec des defaults opposés :
--   - 20260515000000_questions_is_active_toggle.sql      -> DEFAULT FALSE
--   - 2026-05-15-200000-add-is-active-to-teacher-questions.sql -> DEFAULT TRUE
-- C'est la seconde (appliquée à la main via Management API) qui a gagné en
-- PRODUCTION. Sur une base fraîche (CI, dev local), c'est probablement l'autre.
-- Corollaire à connaître avant de tester : le scénario des 986 N'EST PAS
-- reproductible en local — un backfill joué sur une base neuve est un no-op
-- silencieux. Pour le tester, seeder explicitement des lignes
-- (is_active = true, validated_at IS NULL).
-- Cette migration ne suppose donc AUCUN état de départ : elle pose le default
-- de façon absolue.
--
-- ── Conformité règle 23 ─────────────────────────────────────────────────────
-- Aucun DELETE. Un UPDATE de colonne d'état, réversible, sur une table qui n'est
-- pas dans la liste des tables événementielles protégées.
--
-- Idempotente : rejouable sans effet de bord.

BEGIN;

-- 1) Plus rien ne naît actif. Le lock pris ici couvre l'étape 2.
ALTER TABLE public.teacher_questions
  ALTER COLUMN is_active SET DEFAULT false;

-- 2) Les jamais-relues redeviennent inactives.
--    `is_active = true` ne sert qu'à réduire le volume de writes ; la clause
--    reste idempotente et le résultat identique sans elle.
--    NE PAS toucher :
--      - les validées (validated_at NOT NULL) — 179 lignes, stock légitime ;
--      - les rejetées (rejected_at NOT NULL) — 4 lignes, déjà exclues.
UPDATE public.teacher_questions
   SET is_active = false
 WHERE is_active = true
   AND validated_at IS NULL
   AND rejected_at IS NULL;

COMMENT ON COLUMN public.teacher_questions.is_active IS
  'Porte unique d''assignabilité : true = la question peut atteindre un élève. '
  'validated_at/rejected_at sont conservées comme journal de revue (onglets, '
  'file "à relire") mais ne gatent plus rien. ATTENTION : la policy RLS actuelle '
  'laisse un élève authentifié écrire cette colonne — le verrou réel est la '
  'refonte RLS (carte P0), pas ce booléen.';

COMMIT;
