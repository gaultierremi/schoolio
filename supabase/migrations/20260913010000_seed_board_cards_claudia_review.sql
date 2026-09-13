-- Seed board : findings de la review Claudia du 2026-09-13 (5 cartes).
--
-- Contexte : review du chantier "is_active porte unique d'assignabilité"
-- (feat/fix-validation-double-gate). Ces findings sont HORS de cette PR par
-- décision (règles 17 et 18) : soit domaine d'un autre propriétaire, soit dette
-- préexistante, soit effet de bord à suivre. Les carter les rend adressables.
--
-- La première est la seule vraie priorité : elle conditionne la promesse de
-- sécurité de la PR qu'elle accompagne.
--
-- Idempotence à deux barrières, comme 20260902000000 : UUID épinglés
-- + ON CONFLICT (id) DO NOTHING, et WHERE NOT EXISTS sur le titre (title n'a pas
-- de contrainte UNIQUE). Aucun schéma touché.

BEGIN;

WITH payload (id, type, title, description, priority) AS (
  VALUES
  (
    '9f0c1a5d-0002-4000-8000-000000000001'::uuid,
    'bug',
    'RLS teacher_questions : un élève lit les réponses et écrit is_active',
    $md$LE vrai verrou. Tout le reste (double-gate, backfill, filtres applicatifs) protège contre l'ACCIDENT ; ceci est le seul chantier qui protège contre un ÉLÈVE qui cherche.

CONSTAT (vérifié) : supabase/migrations/20260513140200_multi_tenant_rls.sql:47-51 est la SEULE policy sur teacher_questions dans tout le dossier de migrations :

  CREATE POLICY "teacher_questions_tenant_scope"
    ON public.teacher_questions FOR ALL
    TO authenticated
    USING (school_id IS NULL OR school_id = public.current_user_school_id())
    WITH CHECK (school_id = public.current_user_school_id());

Prédicat = school_id uniquement. Aucune mention de teacher_id, is_active, validated_at.

CONSÉQUENCES :
(1) Tout élève authentifié de l'école peut SELECT l'intégralité de teacher_questions de son école — answer_index (les bonnes réponses) compris — via PostgREST avec la clé anon, qui est publique par construction. Ce n'est pas théorique : app/accueil/rejoindre/[code]/page.tsx:58-63 fait déjà ce SELECT depuis le navigateur avec la session élève. Si ça marche sur un id, ça marche sans le .eq("id").
(2) FOR ALL inclut UPDATE et DELETE. USING passe (même école), WITH CHECK passe (school_id inchangé). Un élève peut exécuter UPDATE teacher_questions SET is_active = true et s'auto-autoriser du contenu que son prof n'a pas relu — ou supprimer des questions.

AGGRAVANT : le fix du double-gate (feat/fix-validation-double-gate) fait d'is_active la porte UNIQUE d'assignabilité. Il concentre donc 100 % de l'autorisation sur une colonne que la population protégée peut écrire elle-même. La PR l'assume noir sur blanc (COMMENT ON COLUMN dans 20260913000000) et renvoie ici.

Nuance honnête : avant ce fix, un élève capable d'écrire is_active pouvait tout aussi bien écrire validated_at dans le même UPDATE. Le double-gate n'a jamais été une barrière contre cet attaquant — le fix change le geste d'attaque (une colonne au lieu de deux), pas la capacité. Mais la surface est là depuis mai.

À VÉRIFIER EN PROD D'ABORD (le repo ne le dit pas) :
  SELECT relrowsecurity FROM pg_class WHERE relname = 'teacher_questions';
  SELECT * FROM pg_policies WHERE tablename = 'teacher_questions';
Aucun ALTER TABLE teacher_questions ENABLE ROW LEVEL SECURITY n'existe dans les migrations. Soit RLS a été activée à la main (probable), soit elle n'est PAS active — auquel cas les GRANT par défaut donnent l'accès complet, sans même passer par la policy.

FIX : éclater la policy FOR ALL en policies séparées.
- SELECT prof : school_id = current_user_school_id() AND teacher_id = auth.uid().
- SELECT élève : restreint aux ids réellement servis (EXISTS sur assignment_questions d'un devoir de sa classe, ou live_sessions.question_ids d'une session de sa classe) ET is_active = true. Ne jamais exposer answer_index à un élève hors correction serveur.
- INSERT / UPDATE / DELETE : teacher_id = auth.uid() obligatoire dans USING ET WITH CHECK.

Domaine Alex — dette C2 (la RLS vit sur le remote, pas dans les migrations). Priorité critique : contenu ET réponses accessibles à des mineurs.$md$,
    'critical'
  ),
  (
    '9f0c1a5d-0002-4000-8000-000000000002'::uuid,
    'bug',
    'check-answer + remediation : question_id attaquant-contrôlé, oracle de correction',
    $md$Deux routes élève acceptent un question_id venu du client et le résolvent sans vérifier qu'il appartient à quelque chose que l'élève a le droit de voir.

- app/api/student/check-answer/route.ts:86-92 — question_id vient du BODY. Seul contrôle : tenant (school_id). Aucune vérification d'appartenance à un devoir, aucun contrôle is_active. L'élève peut soumettre n'importe quel question_id de son école et récupérer is_correct → ORACLE DE CORRECTION : il ne lit pas l'énoncé, mais il apprend si sa réponse est la bonne, question par question, y compris sur les 986 non relues.
- app/api/student/remediation/route.ts:43-47 — question_id en query param, tenant seul. Fuite de métadonnée (concept_id), moins grave.

Contraste avec app/api/student/plan-maia/check-answer/route.ts:106-109, qui fait la chose correcte : `if (!planQuestionIds.includes(question_id)) return apiError(...)`. C'est le modèle à reproduire.

FIX : re-gater les deux routes sur l'appartenance (la question fait partie d'un devoir assigné à une classe dont l'élève est membre actif, ou d'une session live à laquelle il participe) ET sur is_active = true. Tant que la carte RLS n'est pas fermée, ce contrôle applicatif est ce qui empêche l'oracle.

Préexistant au chantier double-gate, mais rendu plus visible par lui.$md$,
    'high'
  ),
  (
    '9f0c1a5d-0002-4000-8000-000000000003'::uuid,
    'task',
    'quiz_questions.status : un troisième modèle d''état de questions',
    $md$Le chantier double-gate unifie l'état des questions autour d'is_active (porte) + validated_at/rejected_at (journal). Mais il existe une TROISIÈME table de questions avec son propre modèle d'état.

app/accueil/session/nouvelle/page.tsx:44-49 lit `quiz_questions` filtrée sur `status = 'approved'`, à côté de teacher_questions. Cette table est alimentée par app/api/propose-question/route.ts.

Conséquence : la promesse "un seul état validé" du chantier ne couvre pas ce stock. Un prof qui lance un live peut y piocher, et rien dans le chantier is_active ne s'y applique.

À FAIRE : cartographier quiz_questions (qui écrit, qui lit, combien de lignes en prod, est-ce une relique du pivot HistoGuess ou un flux vivant), puis trancher : migrer vers teacher_questions avec is_active, ou retirer du sélecteur live. Ne pas laisser trois modèles d'état coexister — c'est exactement la dette qui a produit le double-gate.$md$,
    'high'
  ),
  (
    '9f0c1a5d-0002-4000-8000-000000000004'::uuid,
    'task',
    'auto-link : après le backfill, les questions non relues n''ont plus de concept_id',
    $md$Effet de bord du backfill is_active (20260913000000), à documenter et à suivre — pas un bug du chantier, une conséquence prévisible.

app/api/curation/concepts/auto-link/route.ts:123-129 filtre déjà sur `.eq("is_active", true)` seul pour choisir les questions à rattacher à un concept via Haiku. Avant le backfill, les 986 non relues étaient actives et recevaient donc un concept_id. Après, elles sont inactives : l'auto-link ne les voit plus.

CONSÉQUENCE DIFFÉRÉE : le jour où le prof relit et active ces questions, elles n'ont pas de concept_id. Plan Maïa (lib/plan-maia-generation.ts) et les heatmaps concept × élève s'appuient sur concept_id — ces questions seront invisibles pour eux jusqu'à un nouveau passage d'auto-link.

À TRANCHER : soit l'auto-link doit tourner sur TOUTES les questions du cours (relues ou non — le concept d'une question ne dépend pas de sa relecture), soit l'activation d'une question doit déclencher son auto-link. La première option est plus simple et plus cohérente : le filtre is_active dans auto-link mélange deux préoccupations (diffusion et indexation).$md$,
    'medium'
  ),
  (
    '9f0c1a5d-0002-4000-8000-000000000005'::uuid,
    'bug',
    'live/start fuit un message PostgREST brut ; deleteQuestion fait un DELETE dur',
    $md$Deux violations de règles CLAUDE.md, préexistantes, relevées pendant la review du chantier double-gate.

(1) RÈGLE 6 — app/api/live/start/route.ts:129 (139 une fois le fix double-gate mergé) :
  apiError(`... ${insErr?.message}`, 500)
renvoie le message d'erreur PostgREST au client. Fuite de schéma (noms de colonnes, contraintes, types) vers un prof — et vers quiconque appelle la route. Fix : safeError(insErr, "live/start") et un message générique côté client.

(2) RÈGLE 23 (esprit) — app/accueil/curation/_hooks/useQuestionsPage.ts:273 :
  await supabase.from("teacher_questions").delete().eq("id", id);
DELETE dur côté client. teacher_questions n'est pas dans la liste explicite des tables never-DELETE, mais supprimer une question orpheline les assignment_question_answers qui la référencent — c'est-à-dire les réponses passées des élèves, qui SONT dans la liste. Une question supprimée = des lignes de réponses dont on ne sait plus à quoi elles répondaient. Fix : soft-delete (archived_at ou status), jamais DELETE ; et bloquer la suppression si des réponses existent.

Note : la même route deleteQuestion passe par le client anon avec RLS — cf. la carte RLS, la policy FOR ALL laisse aussi un élève exécuter ce DELETE.$md$,
    'medium'
  )
)
INSERT INTO public.admin_board_cards (id, created_by, type, title, description, priority, status, tags)
SELECT
  p.id,
  'claudia',
  p.type,
  p.title,
  p.description,
  p.priority,
  'backlog',
  ARRAY['found-by-claudia', 'security', 'questions-state']::text[]
FROM payload p
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_board_cards c WHERE c.title = p.title
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
