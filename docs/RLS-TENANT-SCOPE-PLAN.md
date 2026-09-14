# Plan de refonte RLS — famille `*_tenant_scope`

**Statut : plan d'application manuelle au dashboard Supabase. Aucun fichier dans
`supabase/migrations/`, aucun code produit.** Rédigé le 2026-09-14, read-only, branche
`docs/rls-tenant-scope-plan`. Review Claudia : voir §12.

Sources : toutes les migrations de `origin/main` (extraction scriptée de chaque `CREATE POLICY`
avec ses clauses `FOR` / `TO` / `USING` / `WITH CHECK`), l'extrait `pg_policies` de la prod fourni
par Gaultier, un balayage de **chaque** `.from("<table>")` de `app/`, `components/`, `lib/` avec
classification du client qui l'exécute (anon-key navigateur, anon-key + session côté serveur,
service role), `docs/PR3-CLASS-LOCK-DESIGN.md` (branche `test/class-delete-invariants`, PR #139).

---

## 0. Résumé exécutif

Huit policies `*_tenant_scope` sont `FOR ALL TO authenticated` avec pour seule condition
l'établissement. Les policies permissives se combinent en **OU** : tout utilisateur authentifié
d'une école — un élève — a donc aujourd'hui INSERT, UPDATE et DELETE sur les classes, devoirs,
cours, questions, concepts, blocs de théorie, créneaux et tags de son école, via PostgREST avec
la clé publique. Les invariants posés dans les routes cette semaine (PR 1 classes, porte unique
`is_active`) sont contournables en une requête depuis la console du navigateur.

Ce que ce plan fait, table par table, en répliquant le pattern déjà en prod sur
`concept_misconceptions`, `content_snippets`, `question_hints` :

1. **DROP** de la policy `FOR ALL`.
2. **SELECT** scopé école, et rôle quand la table l'exige (`classes` : un élève ne voit que les
   classes dont il est membre, parce que la table porte `invite_code` et `invite_link_token`).
3. **INSERT / UPDATE / DELETE** réservés aux profs : `is_current_user_school_teacher()` + école +
   propriété (`teacher_id` / `assigned_by = auth.uid()`) là où la colonne existe. DELETE créé
   uniquement là où un chemin client l'utilise (`teacher_questions`).
4. Une couche **RESTRICTIVE** « écritures = profs uniquement » par table, qui se combine en ET
   avec tout ce qui existe ou existera. C'est elle qui rend la promesse « un élève perd TOUTE
   écriture » vraie même si la prod porte des policies que le repo ne connaît pas (dette C2).
5. Retrait de la clause `school_id IS NULL OR …` : T7 a mis `NOT NULL` sur six des huit
   colonnes (plus `live_sessions` et `user_profiles`), `concepts` et `theory_blocks` sont nées
   `NOT NULL` — la clause est morte, et elle ouvrait toute ligne orpheline à toute l'école de
   n'importe qui.

**Ce qui casserait si on faisait ça naïvement, et pourquoi ce plan ne le fait pas :** il n'existe
que **deux** chemins d'écriture non-service-role vers ces tables dans tout le produit, tous deux
réservés aux profs (le hook de curation, navigateur ; la route `toggle-active`, session
serveur). Les deux passent les nouvelles policies. Toutes les autres écritures — 60 sites —
passent par le service role, qui ignore la RLS. Les lectures élève côté navigateur se limitent à
la page live (`live_sessions`, `teacher_questions`), couvertes. Détail exhaustif §3–§4.

**Trois inconnues prod à lever avant d'appliquer** (requêtes fournies §7.0) : RLS active ou non
sur `teacher_questions` et `user_profiles` (aucune des deux tables n'est créée par une migration
du repo) ; policies d'UPDATE sur `user_profiles.role` (si un élève peut écrire son propre `role`,
`is_current_user_school_teacher()` ne vaut rien) ; `DEFAULT` de `teacher_questions.school_id`
(le hook de curation n'envoie pas `school_id` — s'il fonctionne aujourd'hui, c'est grâce à un
default que le repo ignore).

---

## 1. Inventaire — toute policy accordant une écriture à `authenticated` ou `PUBLIC`

Extraction de `origin/main`, tables de données prof / école uniquement (les tables « no client
writes » `WITH CHECK (false)` et les tables élève `student_manages_own_*` sont exclues).
`PUBLIC` = policy sans clause `TO` : s'applique à `anon` aussi (sans effet pratique, `auth.uid()`
est NULL, mais c'est une hygiène à corriger).

### 1.1 Les huit `*_tenant_scope` (confirmées en prod par l'extrait `pg_policies`)

| Table | Policy | Cmd | Rôle | USING | WITH CHECK | Migration |
|---|---|---|---|---|---|---|
| `assignments` | `assignments_tenant_scope` | ALL | authenticated | `school_id IS NULL OR school_id = cus()` | `school_id = cus()` | `20260513140200:46` |
| `classes` | `classes_tenant_scope` | ALL | authenticated | idem | idem | `20260513140200:28` |
| `courses` | `courses_tenant_scope` | ALL | authenticated | idem | idem | `20260513140200:34` |
| `teacher_questions` | `teacher_questions_tenant_scope` | ALL | authenticated | idem | idem | `20260513140200:40` |
| `teacher_schedule_slots` | `teacher_schedule_slots_tenant_scope` | ALL | authenticated | idem | idem | `20260513140200:60` |
| `teacher_organization_tags` | `teacher_organization_tags_tenant_scope` | ALL | authenticated | idem | idem | `20260513140200:66` |
| `concepts` | `concepts_tenant_scope` | ALL | authenticated | `school_id = cus()` | idem | `20260513170000:112` |
| `theory_blocks` | `theory_blocks_tenant_scope` | ALL | authenticated | `school_id = cus()` | idem | `20260514100000` |

`cus()` = `public.current_user_school_id()` (SECURITY DEFINER, lit `user_profiles.school_id`).

`live_sessions_tenant_scope` (`20260513140200:52`) a été créée puis **emportée par
`20260513180100_drop_live_sessions.sql`** (`DROP TABLE … CASCADE`) ; la table recréée par
`20260514170000` porte `live_sessions_teacher_manage` (owner) et
`live_sessions_student_read_active`. Cohérent avec son absence de l'extrait prod. Le SQL du §7
fait quand même un `DROP POLICY IF EXISTS` par sécurité.

### 1.2 Les autres policies d'écriture sur ces tables (héritage pré-tenant, toutes `PUBLIC`)

| Table | Policy | Cmd | Condition | Verdict |
|---|---|---|---|---|
| `classes` | `teacher_inserts_own_classes` | INSERT | `teacher_id = auth.uid()` | **trou** : un élève peut créer une classe dont il est le « prof » (rien ne vérifie le rôle). Neutralisé par la couche RESTRICTIVE §4. |
| `classes` | `teacher_updates_own_classes` | UPDATE | `teacher_id = auth.uid()` | owner, OK ; neutralisé pour les élèves par RESTRICTIVE |
| `classes` | `teacher_deletes_own_classes` | DELETE | `teacher_id = auth.uid()` | à DROP (PR 3) |
| `class_memberships` | `teacher_manages_memberships` | ALL | prof de la classe | FOR ALL ⇒ DELETE client sur une table règle 23 (PR 3) |
| `assignments` | `teacher_manages_assignments` | ALL | `assigned_by = auth.uid()` | owner ; FOR ALL ⇒ DELETE owner possible, aucun chemin client ne l'utilise |
| `courses` | `teacher_manages_own_courses` | ALL | `teacher_id = auth.uid()` | owner ; idem |
| `teacher_schedule_slots` | `teacher_insert/update/delete_own_slots` | I/U/D | `teacher_id = auth.uid()` | owner, séparés par commande — déjà le bon découpage, sans `TO` |
| `exercises` | `teacher_manages_exercises` | ALL | `teacher_id = auth.uid()` | owner ; pas de tenant scope ; hors périmètre, hygiène |
| `exercise_steps` | `teacher_manages_exercise_steps` | ALL | prof de l'exercice | idem |
| `live_sessions` | `live_sessions_teacher_manage` | ALL | `teacher_id = auth.uid()` + école en CHECK | owner, `TO authenticated` — correct |

Aucune de ces policies héritées ne vérifie le **rôle** : elles supposent que « celui qui met son
propre id dans `teacher_id` est un prof ». C'est pour ça que la couche RESTRICTIVE du §4 est
posée sur toutes les tables, pas seulement là où on retire un `tenant_scope`.

### 1.3 Ce que le repo ne sait pas (dette C2 : la RLS vit sur le remote)

- `teacher_questions` et `user_profiles` n'ont **aucun `CREATE TABLE` ni `ENABLE ROW LEVEL
  SECURITY`** dans `supabase/migrations/`. Leur état RLS et leurs éventuelles policies manuelles
  sont inconnus du repo. Sur les dix autres tables, l'ENABLE est versionné.
- `is_current_user_school_teacher()` lit `user_profiles.role`. Le repo ne contient aucune policy
  sur `user_profiles`. Si la prod laisse un utilisateur `UPDATE` sa propre ligne sans
  restriction de colonne, un élève peut se promouvoir et **toutes** les policies de ce plan
  tombent. Le produit, lui, lit le rôle dans `app_metadata` (`middleware.ts:71`,
  `lib/auth/role.ts:8`), écrit uniquement par service role (`app/auth/callback/route.ts`).
  Précondition n°1 du §7.0 ; alternative durable en §11.

---

## 2. Ce qui casserait — chaque chemin d'écriture non-service-role

Méthode : chaque `.from("<table>")` de `app/`, `components/`, `lib/` a été relevé avec le
client qui l'exécute. Trois familles : **navigateur** (`@/lib/supabase-browser`, clé anon +
session de l'utilisateur, RLS s'applique), **serveur-utilisateur** (`@/lib/supabase-server`,
clé anon + cookies, RLS s'applique), **service role** (`SUPABASE_SERVICE_ROLE_KEY`, bypass RLS).

### 2.1 Écritures qui passent par la RLS (les seules concernées)

| # | Fichier:ligne | Table | Op | Client | Qui | Colonnes posées | Passe le nouveau design ? |
|---|---|---|---|---|---|---|---|
| W1 | `app/accueil/curation/_hooks/useQuestionsPage.ts:259` | `teacher_questions` | update (édition) | navigateur | prof (`isTeacher` via rpc :76 ; lecture filtrée `teacher_id = user.id` :103) | payload d'édition, `.eq("id")` | oui : owner + prof |
| W2 | `…/useQuestionsPage.ts:263` | `teacher_questions` | insert (saisie) | navigateur | prof | `teacher_id: user.id`, `is_active: true`, `validated_at`, **pas de `school_id`** | oui si `school_id` est posé par un DEFAULT côté base — **à vérifier §7.0** |
| W3 | `…/useQuestionsPage.ts:273` | `teacher_questions` | delete | navigateur | prof | `.eq("id")` | oui : policy DELETE owner + prof (créée pour ce chemin) |
| W4 | `…/useQuestionsPage.ts:279` | `teacher_questions` | update (`is_public`) | navigateur | prof | `.eq("id")` | oui |
| W5 | `…/useQuestionsPage.ts:293` | `teacher_questions` | insert (duplication « Copie — ») | navigateur | prof | `teacher_id: user.id`, pas de `school_id` | idem W2 |
| W6 | `…/useQuestionsPage.ts:547` | `teacher_questions` | insert (drafts PDF) | navigateur | prof | `teacher_id: user.id`, pas de `school_id` | idem W2 |
| W7 | `…/useQuestionsPage.ts:581` | `teacher_questions` | insert (import depuis `quiz_questions`) | navigateur | prof | `teacher_id: user.id`, pas de `school_id` | idem W2 |
| W8 | `app/api/curation/[id]/toggle-active/route.ts:110-116` | `teacher_questions` | update (`is_active`, journal) | serveur-utilisateur | prof (la route gate déjà sur `app_metadata.role`, `:83-86`) | `.eq("id").eq("teacher_id", user.id)` | oui : owner + prof |

**Point W2/W5/W6/W7.** Ces quatre inserts n'envoient pas `school_id`. Or `school_id` est
`NOT NULL` depuis T7 (`20260513160000:52`) et la policy actuelle exige déjà
`WITH CHECK (school_id = cus())`. Donc, **aujourd'hui même**, soit ces inserts échouent en prod
(42501 : le `WITH CHECK` est évalué avant `NOT NULL`, et `school_id = cus()` est faux sur
NULL), soit la colonne a un `DEFAULT` posé à la main (typiquement
`DEFAULT public.current_user_school_id()`). Le nouveau design ne change rien à cette
condition — il garde exactement le même `WITH CHECK` sur `school_id` — mais il faut le savoir
avant d'attribuer une régression au plan. Requête en §7.0.

Aucune autre écriture non-service-role n'existe sur les quatorze tables du bloc B. En particulier **aucune
écriture élève**, sur aucune table : la page live élève ne fait que des SELECT
(`app/accueil/rejoindre/[code]/page.tsx:69-74`), ses écritures passent par `/api/live/join`
(`route.ts:57`, service role) et `/api/live/[id]/answer` (`:69`, service role) ; join, leave,
quiz (`start-quiz:58`, `finish-quiz:111,123`), plan Maïa, `mark-read:61` : tout est service role.

### 2.2 Écritures service role (non affectées, pour mémoire — 60 sites)

`classes` : `app/api/classes/route.ts:172` (insert), `app/api/classes/[id]/route.ts:256,335`,
`…/invitation/route.ts:55`, `…/invitation/regenerate/route.ts:60`, `…/regenerate-code/route.ts:63`,
`…/regenerate-link/route.ts:37`. `class_memberships` : `app/api/join/route.ts:106,111`,
`app/api/classes/[id]/members/route.ts:93`, `app/api/classes/[id]/join-full/route.ts:133`,
`app/api/student/classes/[id]/leave/route.ts:31` ; PR #136 (`app/api/join/link/route.ts`)
écrit aussi via `admin`. `assignments` : `app/api/classes/[id]/assignments/route.ts:261`,
`…/[assignmentId]/route.ts:63,95`. `courses` : `app/api/courses/upload-url/route.ts:275,294,355`,
`app/api/courses/infer-metadata/route.ts:337`, `app/api/courses/[id]/route.ts:106`.
`teacher_questions` : `app/api/courses/[id]/extract-questions/route.ts:164,208`,
`app/api/courses/upload-url/route.ts:336`, `app/api/curation/concepts/auto-link/route.ts:169`,
`app/api/teacher-questions/[id]/route.ts:83`, `…/validation/route.ts:132`,
`lib/db/teacher-questions.ts:51`, `lib/contextual-questions.ts:162`,
`lib/generate-questions/run-text-pipeline.ts:391`. `teacher_schedule_slots` :
`app/api/school/schedule/route.ts:140`, `…/[id]/route.ts:139,189`. `teacher_organization_tags` :
`app/api/teacher-tags/route.ts:226`, `…/[id]/route.ts:270,313`. `concepts` :
`lib/ingestion/orchestrator.ts:155`. `theory_blocks` : `app/api/curation/concept/[id]/theory/route.ts:84,117`,
`lib/ingestion/store-outputs.ts:73`. `live_sessions` : `app/api/live/start/route.ts:84,103`,
`app/api/live/[id]/host/route.ts:115`. `exercises` / `exercise_steps` :
`app/api/courses/[id]/exercises/[exerciseId]/**` (6 sites), `lib/exercises/generate-exercises.ts:305,340`.

`components/StudyWizard.tsx:108` lit `teacher_questions` avec `.eq("user_id", …)` (colonne
inexistante) : composant jamais importé, code mort. Ignoré.

---

## 3. Lectures — ce qu'un élève et un prof lisent légitimement, et par quel client

| Table | Lectures élève | Client | Lectures prof | Client | Policy SELECT nécessaire |
|---|---|---|---|---|---|
| `classes` | ses classes via `class_memberships` + relation embarquée `classes(...)` : `EleveHome.tsx:45`, `devoirs/page.tsx:35`, `onboarding/join-class/page.tsx:36`, `parametres/compte/page.tsx:44,55` ; `join/[token]/page.tsx:19` | **service role** partout | ses classes et celles de l'école : `classes/page.tsx`, `classes/[id]/page.tsx`, `invitation/page.tsx:36` ; école entière via `api/school/*` | service role (les pages appellent `rpc("is_current_user_school_teacher")` avec le client user — la fonction reste accessible) | élève : membre actif seulement (la table porte `invite_code`, `invite_link_token`) ; prof : école |
| `assignments` | devoirs de ses classes : `EleveHome.tsx:87`, `devoirs/page.tsx:53`, `devoirs/[id]/bilan/page.tsx:51` | service role | `ProfDevoirsView.tsx:80` + routes | service role | `student_sees_class_assignments` existe déjà (`PUBLIC`, membership active) — **conservée** ; prof : école |
| `courses` | cours de ses devoirs : `devoirs/page.tsx:94`, `lib/student-subjects.ts:34` | service role | `cours/page.tsx` + routes | service role | `student_reads_assigned_courses` existe déjà — **conservée** ; prof : école |
| `teacher_questions` | **navigateur** : `app/accueil/rejoindre/[code]/page.tsx:60` (session live, lit `question, options, answer_index`) ; plan Maïa, quiz, bilan : service role | navigateur + service role | `useQuestionsPage.ts:91` (navigateur, `teacher_id = user.id`), `session/nouvelle/page.tsx:39` (navigateur, own), `curation/concept/[id]/page.tsx:71` (service role) | navigateur | lecture école pour tout authentifié (`*_tenant_read`, le pattern). La page live élève l'exige. Le fait qu'elle lise `answer_index` est la carte P0 RLS déjà ouverte, pas ce plan. |
| `concepts` | `EleveHome.tsx:138`, `concepts/[id]/page.tsx:91`, bilans, `api/student/concept/[id]/theory/route.ts:41-58` | service role partout | curation ; **`app/api/snippets/route.ts:101` lit `concepts` avec le client user, dans le POST sous `requireTeacher`** (le GET `requireUser` :19 ne lit que `content_snippets` :38) | service role + serveur-utilisateur (prof) | lecture école pour tout authentifié : aucun élève n'en dépend, mais rien de sensible et c'est le pattern `content_snippets_tenant_read`. Restreindre à `teacher()` est possible — décision produit (§11) |
| `theory_blocks` | `concepts/[id]/page.tsx:96` | service role | `curation/concept/[id]/page.tsx:66` | service role | lecture école pour tout authentifié (aucun besoin client aujourd'hui, mais rien de sensible) |
| `teacher_schedule_slots` | aucune | — | `api/school/schedule/*` | service role + `teacher_select_own_slots` (owner) | prof de l'école |
| `teacher_organization_tags` | aucune | — | `api/teacher-tags/*` | service role | prof de l'école |
| `live_sessions` | **navigateur** : `rejoindre/[code]/page.tsx:47` (par code) | navigateur | **navigateur** : `live/[id]/page.tsx:55` (hôte) | navigateur | déjà couvert par `live_sessions_student_read_active` et `live_sessions_teacher_manage` — **inchangé** |
| `class_memberships` | via service role | — | `invitation/page.tsx:65`, `ProfDevoirsView.tsx:100` | service role | `teacher_or_student_sees_memberships` existe — inchangé ici, durci en PR 3 |

Conclusion lectures : **aucune page élève ne dépend d'un SELECT client sur `classes`,
`assignments`, `courses`, `concepts` ou `theory_blocks`** ; la seule dépendance élève côté
navigateur est la page live (`live_sessions` + `teacher_questions`), il n'y a **aucune** dépendance élève
côté serveur-utilisateur (la lecture de `concepts` par `api/snippets` est dans le POST prof).
Tout est couvert.

---

## 4. Design par table

Notation : `cus()` = `public.current_user_school_id()`, `teacher()` =
`public.is_current_user_school_teacher()`. Toutes les policies sont `TO authenticated`.

Principe commun à chaque table :

- **PERMISSIVE SELECT** `<t>_tenant_read` (école) — sauf `classes` (deux policies par rôle).
- **PERMISSIVE INSERT** `<t>_teacher_insert` : `WITH CHECK (school_id = cus() AND teacher() [AND owner = auth.uid()])`.
- **PERMISSIVE UPDATE** `<t>_teacher_update` : `USING (école AND teacher() [AND owner])`,
  `WITH CHECK (école [AND owner])` — le `WITH CHECK` empêche de changer d'école ou de propriétaire.
- **PERMISSIVE DELETE** : seulement `teacher_questions` (chemin W3). Ailleurs : aucune → refus
  par défaut pour les clients ; le service role n'est pas concerné.
- **RESTRICTIVE** `<t>_writes_teacher_only_{ins,upd,del}` : `teacher()` sur INSERT, UPDATE,
  DELETE. Se combine en ET avec les permissives héritées (§1.2) : un élève ne peut plus
  rien écrire quoi qu'une policy permissive oubliée lui accorde. Trois policies plutôt qu'une
  `FOR ALL`, parce qu'une RESTRICTIVE `FOR ALL` restreindrait aussi le SELECT aux profs.

| Table | Owner | SELECT | INSERT | UPDATE | DELETE client | Remarques |
|---|---|---|---|---|---|---|
| `classes` | `teacher_id` | prof : école ; élève : école + membre `status='active'` (via helper SECURITY DEFINER, anti-récursion) | prof + owner | prof + owner | **aucun** + RESTRICTIVE `USING (false)` (PR 3) | `teacher_deletes_own_classes` : DROP (PR 3). `teacher_inserts_own_classes` reste mais devient inoffensive (RESTRICTIVE). |
| `assignments` | `assigned_by` (nullable depuis 8b40308) | école (prof) + `student_sees_class_assignments` conservée | prof + owner | prof + owner | aucun | archivage = UPDATE `archived_at`, jamais DELETE dans le produit |
| `courses` | `teacher_id` | école (prof) + `student_reads_assigned_courses` conservée | prof + owner | prof + owner | aucun | DELETE cours via `api/courses/[id]` (service role) |
| `teacher_questions` | `teacher_id` | école, tout authentifié | prof + owner | prof + owner | prof + owner | **précondition** : `ENABLE ROW LEVEL SECURITY` (état inconnu) ; `school_id` DEFAULT (W2) |
| `teacher_schedule_slots` | `teacher_id` | prof de l'école | prof + owner | prof + owner | aucun (les 3 `*_own_slots` héritées restent, owner) | |
| `teacher_organization_tags` | `teacher_id` | prof de l'école | prof + owner | prof + owner | aucun | |
| `concepts` | — | école, tout authentifié (ou `teacher()`, §11) | prof | prof | aucun | seul client user : `api/snippets` POST (prof) |
| `theory_blocks` | — | école, tout authentifié | prof | prof | aucun | |

Tables hors des huit, traitées pour cohérence :

- `class_memberships` : RESTRICTIVE anti-DELETE + remplacement de `teacher_manages_memberships`
  (FOR ALL) par INSERT/UPDATE — c'est le §5 de `docs/PR3-CLASS-LOCK-DESIGN.md`, repris en bloc C.
- `live_sessions`, `exercises`, `exercise_steps`, et (ajoutées après review)
  `class_attendance_records`, `student_random_picks` : policies owner déjà découpées ou
  owner-only, mais sans vérification de rôle ; seule la couche RESTRICTIVE « profs uniquement »
  est ajoutée (bloc B), rien d'autre ne bouge.

### 4.1 La clause `school_id IS NULL OR …`

- Elle a été écrite « pour les lignes legacy avant backfill — T7 ferme le trou »
  (`20260513140200:33`). T7 (`20260513160000:23-53`) a backfillé six des huit tables (plus
  `user_profiles` et `live_sessions`) vers `FounderTestGround` (`00000000-…-0001`) puis posé
  `NOT NULL` ; `concepts` (`20260513170000:87`) et `theory_blocks` (`20260514100000:45`) sont
  nées `NOT NULL`. Le tenant fondateur est un `school_id` **réel**, pas NULL : la clause ne
  le protège pas.
- Conséquence : la clause est morte si T7 est appliqué ; si T7 ne l'est pas, elle donne à tout
  authentifié de toute école la lecture **et l'écriture** des lignes orphelines. Dans les deux
  cas : **la retirer des huit policies**, lectures comprises.
- Garde-fou : requête §7.0-c. Si elle renvoie des lignes NULL, les backfiller vers le tenant
  fondateur **avant** (c'est exactement l'UPDATE de T7), sinon elles deviennent invisibles à tous
  les clients (le service role les voit toujours).

---

## 5. Coordination avec PR 3 (`docs/PR3-CLASS-LOCK-DESIGN.md`, PR #139)

PR 3 veut `DROP POLICY teacher_deletes_own_classes`. Seul, ce DROP est **inutile** : la grant
DELETE la plus large sur `classes` n'est pas cette policy, c'est `classes_tenant_scope`. Ce plan
supprime la seconde (bloc A), la RESTRICTIVE anti-DELETE du bloc C ferme les deux d'un coup, et
le RESTRICT FK de PR 3 reste la ceinture côté base pour le service role.

Ordre recommandé : **ce plan d'abord** (RLS, sans changement de FK, réversible en une
transaction), PR 3 ensuite (FK RESTRICT, décision `class_audit_log` à trancher). Le bloc C est
séparable si Gaultier préfère l'appliquer avec PR 3.

---

## 6. Points de vigilance avant d'écrire une ligne SQL en prod

1. **`user_profiles.role`** — si un utilisateur peut l'UPDATE lui-même, tout le plan est
   contournable. Vérifier (§7.0-a) ; si c'est le cas, appliquer d'abord le trigger du §11.1 ou
   basculer `is_current_user_school_teacher()` sur `app_metadata` (§11.2). Source de vérité
   effective aujourd'hui : `user_profiles.role` est écrit et resynchronisé avec
   `app_metadata.role` uniquement par `app/auth/callback/route.ts:89-104` (service role) —
   cohérent, à condition qu'aucune policy client ne permette de l'écrire.
2. **RLS sur `teacher_questions`** — si elle n'est pas active, les policies ne s'appliquent pas
   du tout aujourd'hui (tout le monde lit et écrit tout) ; l'activer fait passer la table de
   « ouverte » à « scopée » d'un coup : vérifier les lectures §3 juste après.
3. **`teacher_questions.school_id` sans DEFAULT** — alors W2/W5/W6/W7 échouent déjà ; ce n'est
   pas ce plan qui casse, mais il faut le savoir pour ne pas rollbacker à tort.
4. **`current_user_school_id()` renvoie NULL** pour un compte sans ligne `user_profiles` : il ne
   voit rien et n'écrit rien. C'est déjà le cas avec les policies actuelles (hors clause NULL).
5. **Service role** : ignore la RLS. Toutes les routes continuent de fonctionner ; la protection
   des routes reste leur propre contrôle d'auth (règles 4–5).

---

## 7. SQL idempotent — application manuelle au dashboard (éditeur SQL)

> À exécuter **dans l'ordre**, un bloc à la fois, en lisant le résultat des vérifications entre
> deux. Chaque bloc est une transaction ; `DROP POLICY IF EXISTS` avant chaque `CREATE POLICY`
> rend le rejeu sûr. Ce SQL servira aussi de migration de réconciliation quand la dette C2 sera
> traitée — il n'est **volontairement pas** dans `supabase/migrations/`.

### 7.0 Préconditions — lecture seule

```sql
-- a. RLS active ? policies sur user_profiles / teacher_questions ?
SELECT c.relname, c.relrowsecurity AS rls_on, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('user_profiles','teacher_questions','classes','assignments','courses',
                    'teacher_schedule_slots','teacher_organization_tags','concepts','theory_blocks',
                    'class_memberships','live_sessions','exercises','exercise_steps')
ORDER BY 1;

SELECT tablename, policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('user_profiles','teacher_questions')
ORDER BY 1, 2;
-- Attendu sur user_profiles : AUCUNE policy UPDATE accessible à authenticated qui laisse
-- modifier `role` (une policy UPDATE `id = auth.uid()` sans trigger = trou, voir §11).

-- b. DEFAULT et nullabilité de teacher_questions.school_id (chemins W2/W5/W6/W7)
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'teacher_questions'
  AND column_name IN ('school_id','teacher_id');

-- c. Lignes orphelines (clause school_id IS NULL) — attendu : 0 partout
SELECT 'classes' t, count(*) FROM public.classes WHERE school_id IS NULL
UNION ALL SELECT 'assignments', count(*) FROM public.assignments WHERE school_id IS NULL
UNION ALL SELECT 'courses', count(*) FROM public.courses WHERE school_id IS NULL
UNION ALL SELECT 'teacher_questions', count(*) FROM public.teacher_questions WHERE school_id IS NULL
UNION ALL SELECT 'teacher_schedule_slots', count(*) FROM public.teacher_schedule_slots WHERE school_id IS NULL
UNION ALL SELECT 'teacher_organization_tags', count(*) FROM public.teacher_organization_tags WHERE school_id IS NULL
UNION ALL SELECT 'concepts', count(*) FROM public.concepts WHERE school_id IS NULL
UNION ALL SELECT 'theory_blocks', count(*) FROM public.theory_blocks WHERE school_id IS NULL;

-- d. Les deux helpers existent et sont exécutables par authenticated
SELECT p.proname, p.prosecdef, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('current_user_school_id','is_current_user_school_teacher');

-- f. Lignes déjà forgées par le trou (review Claudia) : un élève qui a créé une classe,
--    un devoir, un cours… avant ce plan en reste « owner ». Les policies owner PUBLIC
--    héritées lui laissent LIRE ces lignes (dont invite_code / invite_link_token d'une
--    classe forgée) ; le bloc B lui retire l'écriture. À lister, puis à réattribuer ou
--    archiver À LA MAIN avant d'appliquer — attendu : 0 ligne partout.
SELECT 'classes' t, c.id, c.teacher_id FROM public.classes c
  JOIN public.user_profiles p ON p.id = c.teacher_id WHERE p.role IS DISTINCT FROM 'teacher'
UNION ALL SELECT 'assignments', a.id, a.assigned_by FROM public.assignments a
  JOIN public.user_profiles p ON p.id = a.assigned_by WHERE p.role IS DISTINCT FROM 'teacher'
UNION ALL SELECT 'courses', c.id, c.teacher_id FROM public.courses c
  JOIN public.user_profiles p ON p.id = c.teacher_id WHERE p.role IS DISTINCT FROM 'teacher'
UNION ALL SELECT 'teacher_questions', q.id, q.teacher_id FROM public.teacher_questions q
  JOIN public.user_profiles p ON p.id = q.teacher_id WHERE p.role IS DISTINCT FROM 'teacher'
UNION ALL SELECT 'live_sessions', s.id, s.teacher_id FROM public.live_sessions s
  JOIN public.user_profiles p ON p.id = s.teacher_id WHERE p.role IS DISTINCT FROM 'teacher'
UNION ALL SELECT 'teacher_schedule_slots', s.id, s.teacher_id FROM public.teacher_schedule_slots s
  JOIN public.user_profiles p ON p.id = s.teacher_id WHERE p.role IS DISTINCT FROM 'teacher'
UNION ALL SELECT 'teacher_organization_tags', t.id, t.teacher_id FROM public.teacher_organization_tags t
  JOIN public.user_profiles p ON p.id = t.teacher_id WHERE p.role IS DISTINCT FROM 'teacher';

-- e. Photo AVANT (à conserver pour le rollback §9 et le diff après)
SELECT tablename, policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
  AND tablename IN ('classes','assignments','courses','teacher_questions','teacher_schedule_slots',
                    'teacher_organization_tags','concepts','theory_blocks','class_memberships',
                    'live_sessions','exercises','exercise_steps','class_attendance_records',
                    'student_random_picks')
ORDER BY 1, 2;
```

### 7.1 Bloc A — les huit tables : DROP `*_tenant_scope`, SELECT scopé, écritures profs

```sql
BEGIN;

-- RLS active (idempotent). teacher_questions : état inconnu du repo, on l'impose.
ALTER TABLE public.classes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_questions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_schedule_slots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_organization_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concepts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theory_blocks             ENABLE ROW LEVEL SECURITY;

-- ── classes ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "classes_tenant_scope"        ON public.classes;
DROP POLICY IF EXISTS "classes_teacher_read"        ON public.classes;
DROP POLICY IF EXISTS "classes_student_read_member" ON public.classes;
DROP POLICY IF EXISTS "classes_teacher_insert"      ON public.classes;
DROP POLICY IF EXISTS "classes_teacher_update"      ON public.classes;

CREATE POLICY "classes_teacher_read" ON public.classes
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher());

-- Un élève ne voit que les classes dont il est membre actif : la table porte
-- invite_code et invite_link_token, une lecture « école entière » les exposerait.
-- Passe par un helper SECURITY DEFINER et non par un EXISTS direct : la policy
-- teacher_or_student_sees_memberships (class_memberships) référence déjà classes ;
-- un EXISTS classes → class_memberships fermerait le cycle et Postgres lèverait
-- « infinite recursion detected in policy for relation "classes" ».
CREATE OR REPLACE FUNCTION public.current_user_is_active_member_of(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_memberships cm
    WHERE cm.class_id = p_class_id
      AND cm.student_user_id = auth.uid()
      AND cm.status = 'active'
  );
$$;
GRANT EXECUTE ON FUNCTION public.current_user_is_active_member_of(uuid) TO authenticated;

CREATE POLICY "classes_student_read_member" ON public.classes
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.current_user_is_active_member_of(classes.id));

CREATE POLICY "classes_teacher_insert" ON public.classes
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id()
              AND public.is_current_user_school_teacher()
              AND teacher_id = auth.uid());

CREATE POLICY "classes_teacher_update" ON public.classes
  FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher()
         AND teacher_id = auth.uid())
  WITH CHECK (school_id = public.current_user_school_id()
              AND teacher_id = auth.uid());
-- Pas de DELETE : voir bloc C (PR 3).

-- ── assignments ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "assignments_tenant_scope"   ON public.assignments;
DROP POLICY IF EXISTS "assignments_teacher_read"   ON public.assignments;
DROP POLICY IF EXISTS "assignments_teacher_insert" ON public.assignments;
DROP POLICY IF EXISTS "assignments_teacher_update" ON public.assignments;

CREATE POLICY "assignments_teacher_read" ON public.assignments
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher());
-- Lecture élève : student_sees_class_assignments (20260509100000) reste en place.

CREATE POLICY "assignments_teacher_insert" ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id()
              AND public.is_current_user_school_teacher()
              AND assigned_by = auth.uid());

CREATE POLICY "assignments_teacher_update" ON public.assignments
  FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher()
         AND assigned_by = auth.uid())
  WITH CHECK (school_id = public.current_user_school_id()
              AND assigned_by = auth.uid());

-- ── courses ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "courses_tenant_scope"   ON public.courses;
DROP POLICY IF EXISTS "courses_teacher_read"   ON public.courses;
DROP POLICY IF EXISTS "courses_teacher_insert" ON public.courses;
DROP POLICY IF EXISTS "courses_teacher_update" ON public.courses;

CREATE POLICY "courses_teacher_read" ON public.courses
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher());
-- Lecture élève : student_reads_assigned_courses (20260511020000) reste en place.

CREATE POLICY "courses_teacher_insert" ON public.courses
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id()
              AND public.is_current_user_school_teacher()
              AND teacher_id = auth.uid());

CREATE POLICY "courses_teacher_update" ON public.courses
  FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher()
         AND teacher_id = auth.uid())
  WITH CHECK (school_id = public.current_user_school_id()
              AND teacher_id = auth.uid());

-- ── teacher_questions ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "teacher_questions_tenant_scope"   ON public.teacher_questions;
DROP POLICY IF EXISTS "teacher_questions_tenant_read"    ON public.teacher_questions;
DROP POLICY IF EXISTS "teacher_questions_teacher_insert" ON public.teacher_questions;
DROP POLICY IF EXISTS "teacher_questions_teacher_update" ON public.teacher_questions;
DROP POLICY IF EXISTS "teacher_questions_teacher_delete" ON public.teacher_questions;

-- Lecture école pour tout authentifié : la page live élève lit les questions au
-- navigateur (app/accueil/rejoindre/[code]/page.tsx:60). Le contenu exposé
-- (answer_index) relève de la carte P0 RLS, pas de ce plan.
CREATE POLICY "teacher_questions_tenant_read" ON public.teacher_questions
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY "teacher_questions_teacher_insert" ON public.teacher_questions
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id()
              AND public.is_current_user_school_teacher()
              AND teacher_id = auth.uid());

CREATE POLICY "teacher_questions_teacher_update" ON public.teacher_questions
  FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher()
         AND teacher_id = auth.uid())
  WITH CHECK (school_id = public.current_user_school_id()
              AND teacher_id = auth.uid());

-- Seule table avec un DELETE client (useQuestionsPage.ts:273).
CREATE POLICY "teacher_questions_teacher_delete" ON public.teacher_questions
  FOR DELETE TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher()
         AND teacher_id = auth.uid());

-- ── teacher_schedule_slots ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "teacher_schedule_slots_tenant_scope"   ON public.teacher_schedule_slots;
DROP POLICY IF EXISTS "teacher_schedule_slots_teacher_read"   ON public.teacher_schedule_slots;
DROP POLICY IF EXISTS "teacher_schedule_slots_teacher_insert" ON public.teacher_schedule_slots;
DROP POLICY IF EXISTS "teacher_schedule_slots_teacher_update" ON public.teacher_schedule_slots;

CREATE POLICY "teacher_schedule_slots_teacher_read" ON public.teacher_schedule_slots
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher());

CREATE POLICY "teacher_schedule_slots_teacher_insert" ON public.teacher_schedule_slots
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id()
              AND public.is_current_user_school_teacher()
              AND teacher_id = auth.uid());

CREATE POLICY "teacher_schedule_slots_teacher_update" ON public.teacher_schedule_slots
  FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher()
         AND teacher_id = auth.uid())
  WITH CHECK (school_id = public.current_user_school_id()
              AND teacher_id = auth.uid());
-- teacher_{select,insert,update,delete}_own_slots (owner, 20260509140000) restent.

-- ── teacher_organization_tags ───────────────────────────────────────────────
DROP POLICY IF EXISTS "teacher_organization_tags_tenant_scope"   ON public.teacher_organization_tags;
DROP POLICY IF EXISTS "teacher_organization_tags_teacher_read"   ON public.teacher_organization_tags;
DROP POLICY IF EXISTS "teacher_organization_tags_teacher_insert" ON public.teacher_organization_tags;
DROP POLICY IF EXISTS "teacher_organization_tags_teacher_update" ON public.teacher_organization_tags;

CREATE POLICY "teacher_organization_tags_teacher_read" ON public.teacher_organization_tags
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher());

CREATE POLICY "teacher_organization_tags_teacher_insert" ON public.teacher_organization_tags
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id()
              AND public.is_current_user_school_teacher()
              AND teacher_id = auth.uid());

CREATE POLICY "teacher_organization_tags_teacher_update" ON public.teacher_organization_tags
  FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher()
         AND teacher_id = auth.uid())
  WITH CHECK (school_id = public.current_user_school_id()
              AND teacher_id = auth.uid());

-- ── concepts (pas de colonne owner) ─────────────────────────────────────────
DROP POLICY IF EXISTS "concepts_tenant_scope"   ON public.concepts;
DROP POLICY IF EXISTS "concepts_tenant_read"    ON public.concepts;
DROP POLICY IF EXISTS "concepts_teacher_insert" ON public.concepts;
DROP POLICY IF EXISTS "concepts_teacher_update" ON public.concepts;

-- Lecture école pour tout authentifié (pattern content_snippets_tenant_read). Aucune
-- page élève n'en dépend au client (api/snippets ne lit concepts que dans le POST prof) :
-- restreindre à is_current_user_school_teacher() est une option, voir §11.
CREATE POLICY "concepts_tenant_read" ON public.concepts
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY "concepts_teacher_insert" ON public.concepts
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id()
              AND public.is_current_user_school_teacher());

CREATE POLICY "concepts_teacher_update" ON public.concepts
  FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher())
  WITH CHECK (school_id = public.current_user_school_id());

-- ── theory_blocks (pas de colonne owner) ────────────────────────────────────
DROP POLICY IF EXISTS "theory_blocks_tenant_scope"   ON public.theory_blocks;
DROP POLICY IF EXISTS "theory_blocks_tenant_read"    ON public.theory_blocks;
DROP POLICY IF EXISTS "theory_blocks_teacher_insert" ON public.theory_blocks;
DROP POLICY IF EXISTS "theory_blocks_teacher_update" ON public.theory_blocks;

CREATE POLICY "theory_blocks_tenant_read" ON public.theory_blocks
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY "theory_blocks_teacher_insert" ON public.theory_blocks
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id()
              AND public.is_current_user_school_teacher());

CREATE POLICY "theory_blocks_teacher_update" ON public.theory_blocks
  FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id()
         AND public.is_current_user_school_teacher())
  WITH CHECK (school_id = public.current_user_school_id());

-- Sécurité : la policy tenant_scope de live_sessions a été emportée par le DROP TABLE
-- de 20260513180100 ; on s'en assure.
DROP POLICY IF EXISTS "live_sessions_tenant_scope" ON public.live_sessions;

COMMIT;
```

### 7.2 Bloc B — couche RESTRICTIVE « écritures = profs uniquement »

Se combine en **ET** avec toutes les permissives, connues ou non. C'est ce bloc qui rend la
checklist « un élève perd TOUTE écriture » vraie table par table, y compris face aux policies
héritées `PUBLIC` du §1.2 et à d'éventuelles policies manuelles en prod.

```sql
BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'classes','assignments','courses','teacher_questions','teacher_schedule_slots',
    'teacher_organization_tags','concepts','theory_blocks',
    'class_memberships','live_sessions','exercises','exercise_steps',
    -- ajoutées après review : leurs policies FOR ALL PUBLIC (20260510010000, 20260510030000)
    -- donnent l'écriture au « prof de la classe » sans vérifier le rôle — un élève qui a
    -- forgé une classe avant ce plan y écrirait encore. Aucun chemin client n'y écrit
    -- (attendance/route.ts:64 et live/[id]/host : service role).
    'class_attendance_records','student_random_picks'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_writes_teacher_only_ins', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_writes_teacher_only_upd', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_writes_teacher_only_del', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (public.is_current_user_school_teacher())',
      t || '_writes_teacher_only_ins', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (public.is_current_user_school_teacher())',
      t || '_writes_teacher_only_upd', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (public.is_current_user_school_teacher())',
      t || '_writes_teacher_only_del', t);
  END LOOP;
END $$;

COMMIT;
```

Les élèves n'écrivent sur **aucune** de ces quatorze tables côté client (§2) : ce bloc ne peut
casser qu'un chemin qui n'existe pas. Les tables où les élèves écrivent légitimement
(`assignment_completions`, `assignment_question_answers`, `live_session_answers`,
`live_session_participants`, `plan_maia_answers`, `hint_evaluations`) ne sont **pas** dans la
liste — ne pas les y ajouter.

### 7.3 Bloc C — coordination PR 3 (séparable)

```sql
BEGIN;

-- C1. La grant DELETE explicite du prof sur ses classes (PR 3, étape 1).
DROP POLICY IF EXISTS "teacher_deletes_own_classes" ON public.classes;

-- C2. Aucun client ne supprime une classe ni un membership, quel que soit le rôle
--     (règle 23 pour class_memberships ; PR 1 passe par le service role, non concerné).
DROP POLICY IF EXISTS "classes_no_client_delete" ON public.classes;
CREATE POLICY "classes_no_client_delete" ON public.classes
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "class_memberships_no_client_delete" ON public.class_memberships;
CREATE POLICY "class_memberships_no_client_delete" ON public.class_memberships
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- C3. teacher_manages_memberships : FOR ALL → INSERT + UPDATE, TO authenticated, prof requis.
--     Aucun chemin client n'écrit sur class_memberships (join/leave/members = service role) :
--     ces deux policies sont de la défense en profondeur, pas un besoin applicatif.
DROP POLICY IF EXISTS "teacher_manages_memberships"        ON public.class_memberships;
DROP POLICY IF EXISTS "class_memberships_teacher_insert"   ON public.class_memberships;
DROP POLICY IF EXISTS "class_memberships_teacher_update"   ON public.class_memberships;

CREATE POLICY "class_memberships_teacher_insert" ON public.class_memberships
  FOR INSERT TO authenticated
  WITH CHECK (public.is_current_user_school_teacher()
              AND EXISTS (SELECT 1 FROM public.classes c
                          WHERE c.id = class_memberships.class_id
                            AND c.teacher_id = auth.uid()));

CREATE POLICY "class_memberships_teacher_update" ON public.class_memberships
  FOR UPDATE TO authenticated
  USING (public.is_current_user_school_teacher()
         AND EXISTS (SELECT 1 FROM public.classes c
                     WHERE c.id = class_memberships.class_id
                       AND c.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.classes c
                      WHERE c.id = class_memberships.class_id
                        AND c.teacher_id = auth.uid()));

COMMIT;
```

### 7.4 Vérification post-application

```sql
-- Plus aucune policy FOR ALL accessible à authenticated/PUBLIC sur les tables prof/école,
-- hormis les owner-only listées (attendu : teacher_manages_assignments,
-- teacher_manages_own_courses, teacher_manages_exercises, teacher_manages_exercise_steps,
-- live_sessions_teacher_manage — toutes owner, toutes neutralisées pour les élèves par le bloc B).
SELECT tablename, policyname, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND cmd = 'ALL'
  AND tablename IN ('classes','assignments','courses','teacher_questions','teacher_schedule_slots',
                    'teacher_organization_tags','concepts','theory_blocks','class_memberships',
                    'live_sessions','exercises','exercise_steps')
ORDER BY 1, 2;

-- Aucune policy *_tenant_scope restante
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE '%\_tenant\_scope' ESCAPE '\';

-- 42 restrictives « profs uniquement » attendues (14 tables × 3)
SELECT count(*) FROM pg_policies
WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE'
  AND policyname LIKE '%\_writes\_teacher\_only\_%' ESCAPE '\';

-- + 2 anti-DELETE si bloc C appliqué (nommées différemment, comptées à part)
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE'
  AND policyname IN ('classes_no_client_delete','class_memberships_no_client_delete');
```

---

## 8. Plan de test post-application

### 8.1 Dans l'éditeur SQL, sans clé ni compte (impersonation PostgREST)

Remplacer `<STUDENT_UID>`, `<TEACHER_UID>`, `<SCHOOL_ID>`, `<CLASS_ID_MEMBRE>`, `<PROGRAM_ID>`
par des valeurs réelles. `set_config` reproduit exactement ce que PostgREST fait avec un JWT.

**Une transaction par écriture** (review Claudia, bloquant B2) : dans Postgres, la première
erreur 42501 met la transaction en état `aborted` et toutes les instructions suivantes
échouent avec `current transaction is aborted` — les « 0 ligne » des UPDATE/DELETE ne
seraient jamais observés. À l'inverse, AVANT le plan, un `DELETE classes` réussi cascade les
devoirs et memberships, et les UPDATE suivants renvoient 0 ligne pour la mauvaise raison. Donc :
un bloc `BEGIN … ROLLBACK` par instruction, et le DELETE de classe en dernier.

```sql
-- Préambule commun à chaque bloc ÉLÈVE (à recopier dans chaque BEGIN) :
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     json_build_object('sub','<STUDENT_UID>','role','authenticated')::text, true);

-- ── Session ÉLÈVE — lectures légitimes (une seule transaction suffit, rien n'échoue) ──
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','<STUDENT_UID>','role','authenticated')::text, true);
SELECT count(*) AS mes_classes FROM public.classes;                    -- = nb de classes où membre actif
SELECT count(*) AS mes_devoirs FROM public.assignments;                -- via student_sees_class_assignments
SELECT count(*) AS mes_cours   FROM public.courses;                    -- via student_reads_assigned_courses
SELECT count(*) AS concepts    FROM public.concepts;                   -- école
SELECT count(*) AS questions   FROM public.teacher_questions;          -- école (page live)
SELECT count(*) AS sessions    FROM public.live_sessions WHERE ended_at IS NULL;
ROLLBACK;

-- ── Session ÉLÈVE — écritures, UNE transaction chacune ──
-- Attendu : INSERT → erreur 42501 ; UPDATE/DELETE … RETURNING id → 0 ligne.
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub','<STUDENT_UID>','role','authenticated')::text, true);
INSERT INTO public.classes (teacher_id, name, school_id, invite_code)
  VALUES ('<STUDENT_UID>', 'x', '<SCHOOL_ID>', 'ZZZZZZ1');                       -- 42501
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub','<STUDENT_UID>','role','authenticated')::text, true);
UPDATE public.classes SET name = 'pwned' WHERE id = '<CLASS_ID_MEMBRE>' RETURNING id; -- 0 ligne
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub','<STUDENT_UID>','role','authenticated')::text, true);
UPDATE public.assignments SET archived_at = now() RETURNING id;                    -- 0 ligne
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub','<STUDENT_UID>','role','authenticated')::text, true);
UPDATE public.teacher_questions SET is_active = false RETURNING id;                -- 0 ligne
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub','<STUDENT_UID>','role','authenticated')::text, true);
INSERT INTO public.teacher_questions (teacher_id, school_id, question, type)
  VALUES ('<STUDENT_UID>', '<SCHOOL_ID>', 'x', 'mcq');                            -- 42501
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub','<STUDENT_UID>','role','authenticated')::text, true);
DELETE FROM public.class_memberships RETURNING id;                                 -- 0 ligne
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub','<STUDENT_UID>','role','authenticated')::text, true);
INSERT INTO public.concepts (school_id, program_id, name, slug)
  VALUES ('<SCHOOL_ID>', '<PROGRAM_ID>', 'x', 'x-rls-test');                      -- 42501
ROLLBACK;

-- Tables ajoutées au bloc B suite à la review (lignes forgées, voir §7.0-f) :
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub','<STUDENT_UID>','role','authenticated')::text, true);
INSERT INTO public.class_attendance_records (class_id, student_user_id, recorded_by, date, status)
  VALUES ('<CLASS_ID_MEMBRE>', '<STUDENT_UID>', '<STUDENT_UID>', current_date, 'present'); -- 42501
ROLLBACK;

-- EN DERNIER (cascade si le trou est ouvert) :
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', json_build_object('sub','<STUDENT_UID>','role','authenticated')::text, true);
DELETE FROM public.classes WHERE id = '<CLASS_ID_MEMBRE>' RETURNING id;            -- 0 ligne
ROLLBACK;

-- ── Session PROF ─────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','<TEACHER_UID>','role','authenticated')::text, true);
SELECT count(*) FROM public.classes;                                    -- toutes les classes de l'école
INSERT INTO public.teacher_questions (teacher_id, school_id, question, type)
  VALUES ('<TEACHER_UID>', '<SCHOOL_ID>', 'test rls', 'mcq') RETURNING id;        -- 1 ligne
UPDATE public.teacher_questions SET question = 'test rls 2'
  WHERE teacher_id = '<TEACHER_UID>' AND question = 'test rls' RETURNING id;       -- 1 ligne
DELETE FROM public.teacher_questions
  WHERE teacher_id = '<TEACHER_UID>' AND question = 'test rls 2' RETURNING id;     -- 1 ligne
UPDATE public.teacher_questions SET is_active = false
  WHERE teacher_id <> '<TEACHER_UID>' RETURNING id;                      -- 0 ligne (owner : question d'un collègue)
DELETE FROM public.classes WHERE teacher_id = '<TEACHER_UID>' RETURNING id;        -- 0 ligne (bloc C)
ROLLBACK;
```

Note sur les codes d'erreur (corrigée après review) : Postgres évalue le `WITH CHECK` des
policies **avant** les contraintes `NOT NULL` / `CHECK` (`ExecWithCheckOptions` précède
`ExecConstraints`). Un INSERT élève renvoie donc 42501 même avec un payload incomplet — c'est
bien la RLS qui parle. En revanche un INSERT **prof** avec un payload incomplet échoue en 23502
(la RLS passe, la contrainte non) : compléter les colonnes `NOT NULL` sans DEFAULT
(`concepts` : `program_id`, `slug`). Corollaire pour W2 (§2.1) : si `teacher_questions.school_id`
n'a pas de DEFAULT en prod, les inserts du hook de curation échouent **aujourd'hui** en 42501
(`school_id = cus()` est faux sur NULL), pas en 23502.

Pour comparer : rejouer la session ÉLÈVE **avant** d'appliquer le §7 — l'INSERT passe et les
UPDATE/DELETE renvoient des lignes. C'est la preuve du trou, à garder dans la PR de
réconciliation.

### 8.2 Depuis un navigateur, avec la clé anon (ce que ferait un élève curieux)

Dans la console de l'app, connecté en élève (le client est déjà instancié dans les pages,
ex. `app/accueil/classes/[id]/page.tsx`) ou avec un script Node + `@supabase/supabase-js` et
`signInWithPassword` d'un compte élève de test :

```js
const { createClient } = window.supabase ?? await import("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
// (ou récupérer l'instance existante de la page)

// Lectures : OK
console.log(await sb.from("classes").select("id, name"));               // ses classes seulement
console.log(await sb.from("teacher_questions").select("id").limit(1));  // école

// Écritures : attendu { error: { code: "42501" } } ou data: [] sans ligne touchée
console.log(await sb.from("classes").delete().neq("id", "00000000-0000-0000-0000-000000000000").select());
console.log(await sb.from("assignments").update({ archived_at: new Date().toISOString() }).neq("id", "0").select());
console.log(await sb.from("teacher_questions").update({ is_active: false }).neq("id", "0").select());
console.log(await sb.from("teacher_questions").insert({ question: "x", type: "mcq" }).select());
console.log(await sb.from("class_memberships").delete().neq("id", "0").select());
```

Connecté en **prof** : refaire la saisie, la duplication, la suppression d'une question et
le toggle `is_active` depuis l'UI (`/accueil/curation`) — ce sont W1…W8, les huit chemins qui
passent par la RLS. Puis créer une classe, un devoir, un créneau depuis l'UI (service role,
doivent être inchangés). Puis, en élève : rejoindre une session live par code (lecture
`teacher_questions` + `live_sessions` au navigateur), consulter ses devoirs, son plan Maïa.

---

## 9. Rollback — restaurer l'état actuel à l'identique

Texte reproduit depuis l'extrait `pg_policies` prod et `20260513140200` / `20260513170000` /
`20260514100000`. Une transaction, idempotente.

```sql
BEGIN;

-- Retirer tout ce que le plan a créé (blocs A, B, C)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND (
         policyname LIKE '%\_writes\_teacher\_only\_%' ESCAPE '\'
      OR policyname IN (
        'classes_teacher_read','classes_student_read_member','classes_teacher_insert','classes_teacher_update',
        'assignments_teacher_read','assignments_teacher_insert','assignments_teacher_update',
        'courses_teacher_read','courses_teacher_insert','courses_teacher_update',
        'teacher_questions_tenant_read','teacher_questions_teacher_insert','teacher_questions_teacher_update','teacher_questions_teacher_delete',
        'teacher_schedule_slots_teacher_read','teacher_schedule_slots_teacher_insert','teacher_schedule_slots_teacher_update',
        'teacher_organization_tags_teacher_read','teacher_organization_tags_teacher_insert','teacher_organization_tags_teacher_update',
        'concepts_tenant_read','concepts_teacher_insert','concepts_teacher_update',
        'theory_blocks_tenant_read','theory_blocks_teacher_insert','theory_blocks_teacher_update',
        'classes_no_client_delete','class_memberships_no_client_delete',
        'class_memberships_teacher_insert','class_memberships_teacher_update'))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.current_user_is_active_member_of(uuid);

-- Recréer les huit tenant_scope telles qu'en prod (DROP IF EXISTS devant chaque
-- CREATE : le rollback doit passer aussi bien après A+B seuls qu'après A+B+C, et se
-- rejouer sans erreur — review Claudia, bloquant B1)
DROP POLICY IF EXISTS "assignments_tenant_scope" ON public.assignments;
CREATE POLICY "assignments_tenant_scope" ON public.assignments FOR ALL TO authenticated
  USING ((school_id IS NULL) OR school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());
DROP POLICY IF EXISTS "classes_tenant_scope" ON public.classes;
CREATE POLICY "classes_tenant_scope" ON public.classes FOR ALL TO authenticated
  USING ((school_id IS NULL) OR school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());
DROP POLICY IF EXISTS "courses_tenant_scope" ON public.courses;
CREATE POLICY "courses_tenant_scope" ON public.courses FOR ALL TO authenticated
  USING ((school_id IS NULL) OR school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());
DROP POLICY IF EXISTS "teacher_questions_tenant_scope" ON public.teacher_questions;
CREATE POLICY "teacher_questions_tenant_scope" ON public.teacher_questions FOR ALL TO authenticated
  USING ((school_id IS NULL) OR school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());
DROP POLICY IF EXISTS "teacher_schedule_slots_tenant_scope" ON public.teacher_schedule_slots;
CREATE POLICY "teacher_schedule_slots_tenant_scope" ON public.teacher_schedule_slots FOR ALL TO authenticated
  USING ((school_id IS NULL) OR school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());
DROP POLICY IF EXISTS "teacher_organization_tags_tenant_scope" ON public.teacher_organization_tags;
CREATE POLICY "teacher_organization_tags_tenant_scope" ON public.teacher_organization_tags FOR ALL TO authenticated
  USING ((school_id IS NULL) OR school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());
DROP POLICY IF EXISTS "concepts_tenant_scope" ON public.concepts;
CREATE POLICY "concepts_tenant_scope" ON public.concepts FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());
DROP POLICY IF EXISTS "theory_blocks_tenant_scope" ON public.theory_blocks;
CREATE POLICY "theory_blocks_tenant_scope" ON public.theory_blocks FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());

-- Bloc C : restaurer les deux policies héritées (20260508100000:79 et :90).
-- Idempotent : si le bloc C n'a pas été appliqué, elles existent encore.
DROP POLICY IF EXISTS "teacher_deletes_own_classes" ON public.classes;
CREATE POLICY "teacher_deletes_own_classes" ON public.classes FOR DELETE
  USING (teacher_id = auth.uid());
DROP POLICY IF EXISTS "teacher_manages_memberships" ON public.class_memberships;
CREATE POLICY "teacher_manages_memberships" ON public.class_memberships FOR ALL
  USING (EXISTS (SELECT 1 FROM public.classes
                 WHERE id = class_memberships.class_id AND teacher_id = auth.uid()));

COMMIT;
```

Le rollback **ne désactive pas** la RLS sur `teacher_questions` si le bloc A l'a activée : si
§7.0-a montrait `rls_on = false` avant, et que c'est ce qu'on veut retrouver, ajouter
`ALTER TABLE public.teacher_questions DISABLE ROW LEVEL SECURITY;` — à ne faire qu'en
connaissance de cause, c'est rouvrir la table.

Test du rollback : rejouer la session ÉLÈVE du §8.1 — les UPDATE/DELETE renvoient de nouveau
des lignes (le trou est de retour, donc le rollback est fidèle). Vérifié par Claudia sur un
Postgres 16 jetable : après A+B+C puis rollback, `diff` vide entre la photo AVANT et la photo
APRÈS rollback (38 policies, `qual` / `with_check` / `roles` identiques).

---

## 10. Ordre d'application recommandé

1. **§7.0** en lecture seule. Conserver la sortie de (e) (photo AVANT). Lever les trois
   inconnues : (a) `user_profiles.role` — si modifiable par l'utilisateur, appliquer §11.1
   d'abord ; (a) RLS `teacher_questions` ; (b) DEFAULT `school_id` ; (c) zéro ligne NULL.
2. **§8.1 session ÉLÈVE avant** — constater les lignes touchées (preuve).
3. **Bloc B d'abord** (RESTRICTIVE). C'est le bloc le moins risqué (il n'ajoute que des ET) et
   le plus rentable : à lui seul il ferme l'écriture élève sur les quatorze tables, sans toucher
   aux lectures. Rejouer §8.1 ÉLÈVE : les écritures doivent déjà échouer.
4. **Bloc A** (remplacement des huit `tenant_scope`). Rejouer §8.1 ÉLÈVE et PROF, puis §8.2 en
   prof sur `/accueil/curation` (W1…W8).
5. **Bloc C** avec ou après PR 3, au choix de Gaultier.
6. **§7.4** vérifications, photo APRÈS, diff avec la photo AVANT.
7. Hors heures de cours — les `CREATE POLICY` sont instantanés, mais un test raté en
   pleine session live serait visible des élèves.
8. Ensuite seulement : PR de réconciliation `supabase/migrations/` reprenant le SQL des blocs
   tel qu'appliqué (dette C2), avec le test §8.1 transposé sur un Postgres jetable, comme
   `scripts/verify-migration-is-active-single-gate.sh` (branche `feat/fix-validation-double-gate`,
   PR #137 — pas encore sur `main`).

---

## 11. Restant à trancher par Gaultier

1. **Protéger `user_profiles.role` côté base.** Deux options :
   - 11.1 un trigger `BEFORE UPDATE` SECURITY DEFINER `SET search_path = ''` qui rejette tout
     changement de `role` (et de `school_id`) quand `current_setting('request.jwt.claim.role', true) = 'authenticated'` ;
   - 11.2 redéfinir `is_current_user_school_teacher()` sur la source que le produit considère
     déjà comme la seule fiable (`app_metadata`, règle 3 du CLAUDE.md) :
     `(auth.jwt() -> 'app_metadata' ->> 'role') = 'teacher'`. Plus robuste, mais le rôle vit
     alors dans le JWT : un changement de rôle ne prend effet qu'au refresh du token.
   Le plan fonctionne avec l'un ou l'autre ; sans aucun des deux, il repose sur une colonne dont
   le repo ne garantit pas la protection.
2. **`teacher_questions_tenant_read` pour les élèves** : garder la lecture école (nécessaire à
   la page live, statu quo) ou la restreindre aux questions d'une session live active / d'un
   devoir de l'élève. Le second choix dépasse « répliquer le pattern » et touche la carte P0
   (exposition d'`answer_index`) : à décider avec elle.
3. **Lecture prof « école entière » vs « ses propres lignes »** sur `classes`, `assignments`,
   `courses`, `teacher_schedule_slots`, `teacher_organization_tags`. Ce plan garde l'école
   (statu quo fonctionnel : le dashboard école existe). Restreindre à l'owner serait plus
   strict mais c'est une décision produit.
4. **Bloc C maintenant ou avec PR 3.**
5. **Hygiène héritée** (hors périmètre, à carder) : ajouter `TO authenticated` aux policies
   `PUBLIC` du §1.2 ; découper les `FOR ALL` owner (`teacher_manages_assignments`,
   `teacher_manages_own_courses`, `teacher_manages_exercises`, `teacher_manages_exercise_steps`)
   par commande. Les RESTRICTIVE du bloc B sont `TO authenticated` : le rôle `anon` n'est pas
   couvert, sans effet pratique (`auth.uid()` NULL rend toutes les policies héritées fausses —
   vérifié par Claudia : 0 ligne). Sans urgence une fois le bloc B en place.
7. **Lignes forgées** (§7.0-f) : que faire des classes / devoirs / cours dont l'owner n'est pas
   un prof ? Réattribuer, archiver, ou supprimer via service role — décision au cas par cas,
   avant l'application (une classe forgée garde ses `invite_code` lisibles par son « owner »).
8. **`concepts_tenant_read`** : lecture école pour tous (pattern `content_snippets`) ou
   `teacher()` seulement — aucune page élève ne lit `concepts` au client, les deux marchent.
9. **Synchroniser `docs/PR3-CLASS-LOCK-DESIGN.md`** (branche `test/class-delete-invariants`,
   PR #139) : son §5.3 décrit les policies memberships sans `teacher()` et son §1 cite
   `live_sessions_tenant_scope` comme existante. Le bloc C de ce document est le texte
   canonique ; PR 3 doit y renvoyer plutôt que porter son propre SQL.
6. **W2/W5/W6/W7** : si §7.0-b montre l'absence de DEFAULT sur `school_id`, les quatre inserts
   du hook de curation échouent déjà en prod — carte à ouvrir, correctif produit (poser
   `school_id` côté client ou DEFAULT côté base), indépendant de ce plan.

---

## 12. Review Claudia (2026-09-14)

**Verdict : GO AVEC CORRECTIONS.** Claudia a reproduit le schéma et les policies de `origin/main`
sur un Postgres 16 jetable (owner non-superuser sans `BYPASSRLS`, l'hypothèse la plus stricte),
exécuté les blocs A, B, C, les vérifications §7.4, le test §8.1 et le rollback §9 tels quels,
rejoué A/B/C deux fois (idempotence), et refait indépendamment le balayage des écritures client.

Bloquants, tous intégrés dans cette version :

- **B1** — le rollback §9 échouait si le bloc C n'avait pas été appliqué (`policy
  "teacher_deletes_own_classes" already exists`, transaction annulée, rien restauré) et n'était
  pas rejouable. Corrigé : `DROP POLICY IF EXISTS` devant chacun des dix `CREATE POLICY`.
  Après correction, `diff` vide entre photo AVANT et photo après rollback (38 policies).
- **B2** — le test §8.1 s'auto-invalidait : une seule transaction, donc `current transaction is
  aborted` après le premier 42501 ; et AVANT le plan, le `DELETE classes` cascadait les lignes
  que les UPDATE suivants devaient toucher. Corrigé : une transaction par écriture, DELETE en
  dernier.

Corrections non bloquantes intégrées : ordre `WITH CHECK` avant contraintes (donc 42501 même
sur payload incomplet côté élève ; W2 échoue en 42501, pas 23502) ; payload `concepts` complété
(`program_id`, `slug`) ; justification de `concepts_tenant_read` corrigée (`api/snippets` lit
`concepts` dans le POST prof, pas dans le GET) ; §2.1 corrigé (la page live élève ne fait que
des SELECT, les écritures passent par `/api/live/*` en service role) ; W8 recadré aux lignes
110-116 ; §7.4 : 42 restrictives exactement, les 2 anti-DELETE comptées à part ; formulation T7
(six tables + `live_sessions` + `user_profiles`, `concepts` / `theory_blocks` nées `NOT NULL`) ;
chemin du script de vérification (branche `feat/fix-validation-double-gate`).

Points ratés par le plan, intégrés : (1) **lignes déjà forgées** par le trou — un élève ayant
créé une classe avant le plan en reste owner, lit ses codes d'invitation, et pouvait encore
écrire `class_attendance_records` / `student_random_picks` (policies `FOR ALL PUBLIC` « prof de
la classe » sans vérification de rôle) → requête d'inventaire §7.0-f + ces deux tables ajoutées
au bloc B ; (2) hygiène `anon` notée §11.5 ; (3) source de vérité `user_profiles.role`
synchronisée par le callback d'auth, notée §6.1 ; (4) divergences avec le doc PR 3, à
synchroniser (§11.9).

Vérifié OK par Claudia, sans changement : checklist 1 (aucun chemin cassé — mêmes huit
écritures trouvées indépendamment, zéro `"use server"`, toutes les relations embarquées
`classes(...)` sous service role, `lib/supabase.ts` et `StudyWizard.tsx` sans importeur),
2 (élève sans écriture, y compris propriétaire d'une classe forgée : UPDATE 0, DELETE 0,
INSERT 42501 ; bloc B seul suffit déjà), 3 (`school_id IS NULL`), 4 (SELECT : élève 1 classe
au lieu de 2, devoirs, cours, concepts, questions, sessions visibles ; aucune récursion de
policy ; chaînes `student_sees_class_assignments` → memberships → classes acycliques ;
Realtime `postgres_changes` sur `live_sessions` inchangé), 6 (bloc C = PR 3 §5 étapes 1-3, en
plus strict ; ordre plan → PR 3 correct). Syntaxe : A, B, C, V passent sur PG 16 ; le nom de
policy le plus long fait 49 caractères ; `SET LOCAL ROLE authenticated` + helpers
`SECURITY DEFINER` fonctionnent avec un owner sans `BYPASSRLS` ; `set_config('request.jwt.claims')`
est bien lu par `auth.uid()`.
