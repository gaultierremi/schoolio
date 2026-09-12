-- Seed board — bugs du mode live (Kahoot), audit navigation du 2026-09-02.
--
-- Contexte : diagnostic read-only du parcours « un prof lance une session live ».
-- Règle 17 CLAUDE.md — un bug trouvé pendant un audit ouvre une carte, il n'est
-- pas corrigé dans la foulée. Cette migration ne touche donc AUCUN code
-- applicatif ni aucun schéma : elle n'insère que des cartes de board.
--
-- Idempotence : anti-jointure sur le titre. `admin_board_cards` n'a pas de
-- contrainte UNIQUE sur `title`, donc ON CONFLICT n'est pas utilisable ; le
-- VALUES ci-dessous porte le titre une seule fois, ce qui garantit que la garde
-- et la ligne insérée ne peuvent pas diverger. Rejouer la migration est un
-- no-op ; si une carte est supprimée, la rejouer la recrée au même UUID.
--
-- UUID épinglés (et non gen_random_uuid()) pour que les IDs soient stables et
-- citables entre environnements.
--
-- created_by = 'claudy' : la colonne alimente le filtre auteur de /admin/board
-- (app/admin/board/page.tsx L191 et L213), les cartes restent donc isolables.

BEGIN;

WITH seed (id, title, description, priority) AS (
  VALUES

  -- ───────────────────────────────────────────────────────────────────────────
  ( 'c1a0d900-0000-4000-8000-000000000001'::UUID,
    $t$Live — le bouton « Cours live » mène à un 404$t$,
    $d$Gravité : CRITIQUE — visible par un prof devant sa classe.

app/accueil/cours/[id]/exercices/page.tsx L300 : handleStartLive() pousse vers
/accueil/cours/{id}/live. Cette route n'existe pas — app/accueil/cours/[id]/ ne
contient que exercices/, et next.config.mjs n'a aucun rewrite. Résultat : 404.

C'est le point d'entrée instinctif d'un prof qui veut lancer un live sur son
cours : bouton rouge, icône Radio, en haut de la page « Gérer les exercices ».

Le seul chemin réellement fonctionnel est aujourd'hui :
/accueil (Actions rapides) → « Lancer une session » → /accueil/session/nouvelle
→ POST /api/live/start → /accueil/live/{id}.

Fix : soit rerouter le bouton vers /accueil/session/nouvelle — idéalement en
pré-sélectionnant les questions du cours, /api/live/start accepte déjà un
course_id qui n'est jamais envoyé aujourd'hui — soit retirer le bouton.$d$,
    'critical' ),

  -- ───────────────────────────────────────────────────────────────────────────
  ( 'c1a0d900-0000-4000-8000-000000000002'::UUID,
    $t$Live — l'entrée « Live » de la sidebar prof mène à l'écran élève$t$,
    $d$Gravité : HAUTE — prof perdu, et pollution de la liste des participants.

app/accueil/_components/NavSidebar.tsx L56 : PROF_ITEMS pointe « Live » vers
/accueil/live, qui est le formulaire ÉLÈVE (« Rejoindre une session — saisis le
code à 6 caractères que ton prof a projeté »). Aucun layout ne garde cette
route : seul /accueil/live/[id] a un requireTeacherPage().

Pire : si le prof y saisit son propre code, /api/live/join utilise requireUser()
(et non requireTeacher) avec un client service-role qui contourne la RLS. Le
prof est donc inséré comme participant de sa propre session, puis
/accueil/rejoindre/[code] le rejette vers /accueil via requireStudentPage(). Il
reste dans la liste des participants — et donc dans le tirage au sort.

Il manque un lobby prof : docs/PAGES-WORKFLOW.md L207 liste « /accueil/live
(lobby) » comme 🔴 à builder (liste des sessions live actives).

Fix : builder le lobby prof, ou rerouter PROF_ITEMS « Live » vers
/accueil/session/nouvelle. Dans les deux cas : ajouter un garde de rôle sur
/accueil/live, et durcir /api/live/join pour refuser au minimum le teacher_id
de la session.$d$,
    'high' ),

  -- ───────────────────────────────────────────────────────────────────────────
  ( 'c1a0d900-0000-4000-8000-000000000003'::UUID,
    $t$Live — désynchro question prof / élèves dès 2 questions$t$,
    $d$Gravité : CRITIQUE — casse l'acte pédagogique en pleine session.

app/accueil/live/[id]/page.tsx L117 : la console prof fait
questions[session.current_index], où « questions » provient d'un
.in("id", question_ids) SANS .order(). PostgREST renvoie alors l'ordre de la
table (ordre de création), et non l'ordre du tableau question_ids (ordre de
sélection du prof).

L'API (/api/live/[id]/host, /api/live/[id]/answer) et l'écran élève
(/accueil/rejoindre/[code]) résolvent correctement question_ids[current_index].
Seule la console prof est fausse.

Conséquence : le prof projette la question B pendant que les élèves répondent à
la question A. La distribution des votes, le compteur « N réponses », le
surlignage de la bonne réponse et la réponse du tiré-au-sort portent tous sur la
mauvaise question.

Invisible avec une seule question, ou si le prof coche dans l'ordre d'affichage.

Fix : réordonner selon question_ids côté console prof — indexer le résultat du
.in() par id, puis session.question_ids.map(id => byId.get(id)).$d$,
    'critical' ),

  -- ───────────────────────────────────────────────────────────────────────────
  ( 'c1a0d900-0000-4000-8000-000000000004'::UUID,
    $t$Live — l'onglet « HistoGuess » de la création fait échouer le start$t$,
    $d$Gravité : HAUTE — erreur opaque au moment de créer la session.

app/accueil/session/nouvelle/page.tsx : la sélection de questions propose deux
onglets, « Mes questions » (table teacher_questions) et « HistoGuess » (table
legacy quiz_questions, filtrée sur status = approved).

Or /api/live/start valide TOUS les question_ids contre teacher_questions
uniquement. Dès qu'une question HistoGuess est cochée, la route répond
404 « Certaines questions sont introuvables » — sans indice sur la cause. Le
prof ne peut pas deviner que c'est l'onglet qui est en cause.

quiz_questions est un reste de Schoolio v1 (pré-Maïa), hors modèle multi-tenant :
/api/live/start n'y vérifie aucun school_id.

Fix : retirer l'onglet HistoGuess de la création de session live. Si le contenu
public doit rester utilisable en live, il faut d'abord trancher la migration
quiz_questions → teacher_questions (avec school_id) — pas rafistoler la route.$d$,
    'high' ),

  -- ───────────────────────────────────────────────────────────────────────────
  ( 'c1a0d900-0000-4000-8000-000000000005'::UUID,
    $t$Live — les questions numeric / short_text cassent la session$t$,
    $d$Gravité : CRITIQUE — session bloquée en plein cours, sans message d'erreur.

app/accueil/session/nouvelle/page.tsx : le sélecteur charge teacher_questions
sans AUCUN filtre — ni sur type, ni sur is_active, ni sur la validation
(validated_at / rejected_at). Il propose donc des brouillons non validés et tous
les types.

Or le pipeline IA produit activement du numeric et du short_text
(app/accueil/curation/_types.ts L5), pour lesquels options vaut [] —
lib/generate-questions/run-text-pipeline.ts L372-374 le documente explicitement
(options est NOT NULL TEXT[], donc tableau vide pour les types non-mcq).

Conséquence en session : currentQuestion.options.map() rend ZÉRO bouton côté
élève. Personne ne peut répondre → respondedCount reste à 0 → « Tirer un élève
au sort » est grisé à vie, et /api/live/[id]/host renvoie 409 « Personne n'a
encore répondu ». La question est un cul-de-sac : seuls « Révéler » puis
« Question suivante » permettent d'en sortir.

En prime, le badge de la liste est un ternaire mcq ? « QCM » : « V/F » — une
question numeric ou short_text est donc étiquetée « V/F » et le prof ne peut pas
la repérer avant de la cocher.

Le moteur live est de toute façon MCQ-only : /api/live/[id]/answer ne gère que
answer_index, jamais expected_numeric_answer ni expected_text_answers.

Fix : filtrer le sélecteur sur type IN ('mcq', 'truefalse') + is_active +
questions validées uniquement, et corriger le badge de type.$d$,
    'critical' ),

  -- ───────────────────────────────────────────────────────────────────────────
  ( 'c1a0d900-0000-4000-8000-000000000006'::UUID,
    $t$Live — 3 frictions UX / erreurs à lisser (lot groupé)$t$,
    $d$Gravité : MOYENNE. Trois frictions distinctes, regroupées car chacune est
un correctif isolé de quelques lignes.

1) « Démarrer la 1ère question » grisé tant qu'aucun élève n'est connecté.
   app/accueil/live/[id]/page.tsx : disabled={acting || participants.length === 0}.
   Le prof qui ouvre sa console avant le cours voit un bouton mort, sans
   explication. Le blocage se justifie (une session sans participant n'a pas de
   sens) mais il faut au minimum un libellé du type « En attente du premier
   élève… » plutôt qu'un bouton grisé muet.

2) Élève avec school_id NULL → 500 opaque au join.
   /api/live/join appelle requireSchoolMembership() (lib/tenant.ts), qui throw un
   Error nu quand user_profiles.school_id est NULL. Le catch le passe à
   safeError(err, "live:join") → 500 « Erreur serveur ». L'élève ne sait pas qu'il
   lui manque un rattachement école, et le prof non plus. Même schéma sur
   /api/live/[id]/answer et /api/live/start.
   Fix : convertir en apiError explicite (403 + message actionnable).

3) Depuis la phase « answering », « Tirer au sort » saute directement à « picked ».
   /api/live/[id]/host autorise pick_random depuis answering ET revealed, et met
   phase = 'picked' dans les deux cas. Or la console prof n'affiche « Révéler la
   réponse » que pendant answering : une fois en picked, la révélation est
   inatteignable, il ne reste que « Question suivante » / « Terminer ». La bonne
   réponse n'est alors jamais projetée.
   Fix : soit interdire pick_random depuis answering, soit garder un bouton
   « Révéler » disponible en phase picked.$d$,
    'medium' )

)
INSERT INTO public.admin_board_cards
  (id, created_by, type, title, description, priority, status, tags)
SELECT
  s.id,
  'claudy',
  'bug',
  s.title,
  s.description,
  s.priority,
  'backlog',
  ARRAY['found-by-claudy', 'live']::TEXT[]
FROM seed s
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_board_cards c WHERE c.title = s.title
);

COMMIT;
