-- Seed board : chantier "clarifier le parcours prof" (9 cartes).
--
-- Pourquoi une migration plutôt qu'un POST /api/admin/board : la route exige
-- une session admin sur une app qui tourne (app/api/admin/board/route.ts:47-68),
-- indisponible en environnement d'agent. Le seed est donc versionné.
--
-- IDEMPOTENCE — double barrière, la migration peut être rejouée sans doublon :
--   1. UUID épinglés + ON CONFLICT (id) DO NOTHING  → rejeu de CE fichier.
--   2. WHERE NOT EXISTS sur le titre                → carte déjà créée à la
--      main dans l'UI avec le même titre (il n'y a pas de contrainte UNIQUE
--      sur title, donc ON CONFLICT (title) est impossible).
--
-- Aucun schéma touché : admin_board_cards existe déjà
-- (20260514120000_restore_mission_control.sql), RLS déjà activée, aucune
-- policy publique — tout passe par les routes admin en service_role.
--
-- Toutes les références fichier:ligne ci-dessous ont été vérifiées dans le
-- code à la date du seed.

BEGIN;

WITH payload (id, type, title, description, priority) AS (
  VALUES
  -- ── P0 ────────────────────────────────────────────────────────────────────
  (
    '9f0c1a5d-0000-4000-8000-000000000001'::uuid,
    'bug',
    'Double-gate de validation piège le prof (validated_at vs is_active)',
    $md$Le prof valide ses questions, croit avoir fini, et se fait refuser la création du devoir. C'est le bug le plus coûteux du parcours prof.

CAUSE (vérifiée) :
- L'onglet par défaut "Par concept" n'écrit QUE is_active :
  app/api/curation/[id]/toggle-active/route.ts:112 → .update({ is_active: isActive })
- validated_at ne s'écrit QUE dans l'onglet "Par état" :
  app/api/teacher-questions/[id]/validation/route.ts:111 → update.validated_at = ...
- Or la création de devoir exige LES DEUX :
  app/api/classes/[id]/assignments/route.ts:248-251 et 291-294
  .not("validated_at", "is", null) + .eq("is_active", true)
  (commentaire en place : "Sprint 2B : double-gate is_active + validated_at")

Un prof qui ne travaille que dans l'onglet par défaut ne pose jamais validated_at : ses questions sont actives, affichées comme validées, et invalides pour un devoir.

FIX (deux options) :
(a) Le toggle "Par concept" écrit aussi validated_at.
(b) Supprimer le double-gate — un seul état validé. C'est déjà la direction annoncée dans le code : validation/route.ts:102 dit "Sprint 2C dropera validated_at/rejected_at au profit de is_active seul". Option (b) recommandée : elle supprime la classe de bug au lieu de la rustiner.$md$,
    'critical'
  ),
  (
    '9f0c1a5d-0000-4000-8000-000000000002'::uuid,
    'task',
    'Vocabulaire "Curation" / "legacy" incompréhensible pour le prof',
    $md$Trois mots pour une seule chose : la nav dit "Curation", la page dit "Mes questions", le job dit "valider". Aucun n'est le vocabulaire d'un prof.

Pire : l'onglet qui débloque réellement les devoirs (celui qui écrit validated_at, cf. carte "Double-gate") s'appelle "Par état (legacy)". On expose notre dette technique à l'utilisateur, sur le chemin critique, avec une étiquette qui invite explicitement à ne pas l'utiliser.

FIX :
- Renommer "Curation" → "Questions" dans la nav.
- Retirer le mot "legacy" de l'UI (c'est du vocabulaire d'équipe, pas de produit).
- Fusionner les deux vues, OU faire de "Par état" l'onglet par défaut tant que la fusion n'est pas faite.

Lié à la carte "Double-gate de validation piège le prof" : si le double-gate saute, la fusion des deux vues devient triviale.$md$,
    'critical'
  ),
  (
    '9f0c1a5d-0000-4000-8000-000000000003'::uuid,
    'feature',
    'Pas de "tout valider" : 200 questions = 200 clics',
    $md$Après un import de PDF, un prof se retrouve avec des dizaines à des centaines de questions à valider une par une. Il n'existe aucune action de masse.

C'est le point d'abandon le plus probable du parcours d'onboarding prof : le coût perçu de la mise en route devient supérieur au bénéfice.

FIX : bouton "tout valider" sur la vue filtrée, ou validation par lot / par chapitre. La validation par lot filtré est préférable au "tout valider" global — elle garde le prof responsable de ce qu'il valide.$md$,
    'critical'
  ),

  -- ── P1 ────────────────────────────────────────────────────────────────────
  (
    '9f0c1a5d-0000-4000-8000-000000000004'::uuid,
    'bug',
    'Le sélecteur de cours du formulaire de devoir affiche un compteur mensonger',
    $md$Le prof voit un cours listé avec des questions, le sélectionne pour créer un devoir, et se prend un 400.

CAUSE (vérifiée) : app/api/courses/route.ts:76 et 85-90 comptent TOUTES les questions rattachées au cours (filtre unique : course_id NOT NULL). Aucun filtre sur validated_at ni is_active. Le compteur affiché n'a donc aucun rapport avec ce qui est réellement assignable.

FIX : compter les questions réellement assignables (mêmes critères que assignments/route.ts:248-251), et afficher les deux nombres pour que le prof comprenne l'écart — ex. "Bio ch.3 — 12 validées / 47".$md$,
    'high'
  ),
  (
    '9f0c1a5d-0000-4000-8000-000000000005'::uuid,
    'task',
    'Filtre "période" = fossile HistoGuess, inutile pour toute autre matière',
    $md$app/accueil/curation/_types.ts:92 définit PERIODS = Préhistoire, Antiquité, Moyen Âge, Renaissance, XVIe… C'est un reliquat du produit HistoGuess.

Pour un prof de bio, de maths ou de langues, ce filtre renvoie systématiquement 0 résultat. Il occupe la place du filtre dont le prof a réellement besoin — et qui n'existe nulle part aujourd'hui.

FIX : remplacer par un filtre Cours / Chapitre. Vérifier au passage les autres champs hérités d'HistoGuess dans le même fichier avant de les recâbler dans une nouvelle UI.$md$,
    'high'
  ),
  (
    '9f0c1a5d-0000-4000-8000-000000000006'::uuid,
    'bug',
    'Création manuelle de question cassée : ni course_id ni validated_at',
    $md$Une question créée à la main par le prof est définitivement inassignable, et lui est pourtant présentée comme validée.

CAUSE (vérifiée) :
- app/accueil/curation/_hooks/useQuestionsPage.ts:237-255 — le payload d'insert ne contient NI course_id NI validated_at. Sans course_id, la question n'est rattachée à aucun cours : elle ne peut atteindre aucun devoir.
- useQuestionsPage.ts:604-608 — isPending() exige is_ai_generated === true OU origin === "extracted_from_pdf". Une question manuelle n'est donc ni "pending" ni "rejected" : elle tombe dans validatedQuestionsBase et s'affiche comme validée, alors que validated_at est NULL.

Le prof crée une question, la voit dans "validées", et ne la retrouve jamais dans un devoir. Aucun message ne lui explique pourquoi.

FIX : sélecteur de cours obligatoire dans le formulaire de création + poser validated_at (ou is_active seul, selon l'issue de la carte "Double-gate").$md$,
    'high'
  ),
  (
    '9f0c1a5d-0000-4000-8000-000000000007'::uuid,
    'bug',
    'Les exercices ne sont pas assignables, mais le dashboard les pousse',
    $md$Le dashboard prof affiche "N exercices à valider" et pousse le prof à les traiter. Aucun de ces exercices ne peut atteindre un élève.

CAUSE (vérifiée) : resource_type n'accepte que 'pdf' ou 'quiz', et c'est verrouillé aux deux niveaux —
- app/api/classes/[id]/assignments/route.ts:186-187 (rejet 400),
- CHECK constraint en base : supabase/migrations/20260509100000_recreate_assignments.sql:13.

On demande donc au prof un travail dont le produit ne fait rien. Adrien demande explicitement à pouvoir donner des exercices.

FIX (deux options, à trancher) :
(a) Rendre les exercices assignables : resource_type='exercise'. ⚠️ Nécessite une MIGRATION (élargir le CHECK), plus le parcours élève correspondant — ce n'est pas un quick win.
(b) Retirer la carte "exercices à valider" du dashboard en attendant (a).

(b) est le correctif immédiat honnête ; (a) est le vrai sujet produit.$md$,
    'high'
  ),

  -- ── P2 ────────────────────────────────────────────────────────────────────
  (
    '9f0c1a5d-0000-4000-8000-000000000008'::uuid,
    'task',
    'Lot friction navigation parcours prof (5 points)',
    $md$Regroupées volontairement : individuellement mineures, cumulativement elles rendent le parcours prof illisible.

(a) Une classe s'ouvre sur une Heatmap vide (aucune donnée tant qu'aucun devoir n'est rendu). Le CTA "créer un devoir" est caché au 3e onglet — la première action utile est invisible au premier écran.

(b) L'entrée "Devoirs" de la sidebar ne permet pas de créer un devoir. Le prof doit passer par une classe, ce qui n'est deviné par personne.

(c) Compteurs "à valider" incohérents entre l'accueil et la page curation : deux comptages, deux résultats. Le prof ne sait pas lequel croire.

(d) Liens morts sur le chemin : "Cours live" renvoie un 404, la page ingestion affiche encore "Sprint 2".

(e) Les concepts sont scopés par école, pas par cours — un prof voit des concepts qui ne sont pas les siens dans ses propres filtres.

FIX : à découper en sous-tâches au moment du sprint. Chaque point est petit ; (a) et (b) ont le meilleur ratio impact/effort.$md$,
    'medium'
  ),

  -- ── Amélioration produit ──────────────────────────────────────────────────
  (
    '9f0c1a5d-0000-4000-8000-000000000009'::uuid,
    'idea',
    'Renommer "Cours" → "Ma bibliothèque" + section "Cours utilisés dans cette classe"',
    $md$Le prof cherche en permanence "qu'est-ce que j'ai donné à cette classe ?". Aujourd'hui "Cours" est un dépôt global sans lien visible avec les classes, ce qui le force à reconstruire l'association de tête.

PROPOSITION :
- Renommer "Cours" → "Ma bibliothèque" : dit ce que c'est réellement (un dépôt), et cesse de laisser croire à un lien avec une classe.
- Ajouter une section "Cours utilisés dans cette classe" sur la page classe, calculée depuis les assignments existants.

Intérêt : donne au prof exactement la vue qu'il cherche SANS changer le modèle de données — la relation est déjà déductible des assignments. Pas de migration, pas de nouvelle table.$md$,
    'medium'
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
  ARRAY['found-by-claudy', 'parcours-prof', 'ux']::text[]
FROM payload p
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_board_cards c WHERE c.title = p.title
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
