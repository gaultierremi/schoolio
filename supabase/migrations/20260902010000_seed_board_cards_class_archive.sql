-- Seed board : suites du chantier "suppression de classe -> archivage" (2 cartes).
--
-- Contexte : la PR feat/class-delete-to-archive pose l'invariant anti-destruction
-- dans la ROUTE (DELETE refusé si la classe n'est pas vide). Elle laisse
-- volontairement deux chantiers ouverts, tracés ici pour qu'ils ne se perdent pas.
--
-- Même pattern d'idempotence que 20260902000000 : UUID épinglés
-- + ON CONFLICT (id) DO NOTHING (rejeu du fichier), et WHERE NOT EXISTS sur le
-- titre (carte déjà saisie à la main — title n'a pas de contrainte UNIQUE).
--
-- Aucun schéma touché.

BEGIN;

WITH payload (id, type, title, description, priority) AS (
  VALUES
  (
    '9f0c1a5d-0001-4000-8000-000000000001'::uuid,
    'task',
    'PR 2 — Vue lecture seule pour une classe archivée',
    $md$L'archivage est désormais la sortie sûre pour une classe non vide (cf. PR feat/class-delete-to-archive). Mais une classe archivée n'est aujourd'hui pas consultable : la carte n'est pas cliquable et "Détail →" disparaît (app/accueil/classes/page.tsx:62 et 122). Le prof doit RESTAURER pour consulter. L'archive est un placard, pas une consultation.

Tant que ce n'est pas corrigé, on pousse le prof à restaurer une classe qu'il voulait ranger — et donc à la remettre dans ses listes actives.

TRAVAIL :
1. Rendre la carte archivée ouvrable (le pattern div role="button" + tabIndex est déjà en place, le rendre inconditionnel simplifie même le code) et réafficher "Détail →". Garder opacity-70 pour que l'état reste visible.
2. Neutraliser les 6 contrôles mutants de app/accueil/classes/[id]/page.tsx quand archived_at !== null :
   - régénérer le code d'invitation (~:648)
   - régénérer le lien d'invitation (~:671)
   - lien vers la page d'invitation (~:627) — mène à InvitePageClient, 3 mutations de plus
   - créer un devoir (~:320)
   - archiver un devoir (~:379)
   - retirer / réintégrer un élève (~:750)
3. Passer une prop `readOnly` à AssignmentsTab (~:780), qui ne reçoit aujourd'hui que classId.
4. MASQUER toute la section "Inviter des élèves" (~:620-683), pas seulement ses boutons : afficher un code d'invitation pour une classe archivée est un mensonge, api/join/route.ts:45 refuse le join.
5. CONSERVER : "Exporter CSV" (c'est la valeur d'une archive) et "Restaurer".

⚠️ À écrire honnêtement dans le corps de la PR : les pages filles (/invitation, /devoirs/nouveau, /devoirs/[assignmentId]) restent atteignables à l'URL, et AUCUNE route API ne refuse d'écrire sur une classe archivée. Ce qui est livré ici est un read-only d'INTERFACE. Acceptable — rien ne détruit — à condition de ne pas le vendre comme un verrou.

Détail complet dans la review Claudia du 2026-09-02 (point 5).$md$,
    'high'
  ),
  (
    '9f0c1a5d-0001-4000-8000-000000000002'::uuid,
    'task',
    'PR 3 — LE VRAI VERROU : FK ON DELETE RESTRICT + fermeture des policies',
    $md$La PR feat/class-delete-to-archive pose l'invariant dans la ROUTE. Il ne tient donc que tant qu'on passe par la route.

Deux contournements réels, vérifiés :
- `teacher_deletes_own_classes` (20260508100000:79) est FOR DELETE sans clause TO, donc PUBLIC. Le client anon-key est déjà instancié dans la page (app/accueil/classes/[id]/page.tsx:421) : un `supabase.from('classes').delete().eq('id', ...)` depuis la console détruit tout, route ou pas. Ce n'est pas un modèle de menace inventé — 20260511030000_tighten_rls_with_check.sql:6-10 l'écrit déjà : "the anon-key client can bypass the API and write directly via PostgREST".
- `teacher_manages_memberships` (20260508100000:90) est FOR ALL, ce qui autorise un vrai DELETE client sur class_memberships — table règle 23.

TRAVAIL :
1. Passer en ON DELETE RESTRICT les FK qui cascadent depuis classes : class_memberships, assignments, class_attendance_records, student_random_picks, class_audit_log. La base refuse alors elle-même la destruction, quel que soit le chemin (route, PostgREST, psql, race).
2. DROP POLICY teacher_deletes_own_classes.
3. Durcir teacher_manages_memberships : remplacer FOR ALL par les seules opérations nécessaires, sans DELETE.

⚠️ NE PAS passer tout en RESTRICT en bloc. Décider table par table :
- teacher_schedule_slots.class_id et classes.parent_class_id sont en SET NULL et doivent le RESTER — un RESTRICT sur parent_class_id changerait la sémantique métier de la hiérarchie de cohortes.
- live_sessions.class_id est en SET NULL : idem, le rattachement peut se détacher.

BÉNÉFICE ANNEXE : une fois RESTRICT en place, l'exception assumée sur class_audit_log (non compté par la route, parce que le trigger le remplit dès l'archivage) est fermée par la base elle-même. Les compteurs de la PR 1 deviennent la couche "message lisible" au-dessus du verrou — le bon découpage.

Cette carte est le vrai correctif du risque n°1 de l'audit 2026-09-02. La PR 1 empêche l'erreur du prof ; celle-ci empêche la destruction tout court.$md$,
    'critical'
  )
)
INSERT INTO public.admin_board_cards (id, created_by, type, title, description, priority, status, tags)
SELECT
  p.id,
  'claudy',
  p.type,
  p.title,
  p.description,
  p.priority,
  'backlog',
  ARRAY['found-by-claudy', 'class-archive', 'data-integrity']::text[]
FROM payload p
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_board_cards c WHERE c.title = p.title
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
