# PR 3 — Le vrai verrou : FK `ON DELETE RESTRICT` + fermeture des policies

**Statut : plan de conception, aucun code, aucune migration.** Rédigé le 2026-09-13 (tâche
secondaire de la nuit de tests). Branche porteuse : `test/class-delete-invariants`, pour
voyager avec les 35 tests qui verrouillent la PR 1 (`tests/api/classes-delete.test.ts`).

> Réserve honnête : la consigne conditionnait ce document à « 3 invariants écrits, verts et
> poussés ». L'invariant 3 (SSO join) est intestable — le code visé n'existe sur aucune
> branche, voir le rapport de nuit. Le document a été rédigé quand même parce qu'il est
> read-only, sur une branche de tests, et jetable d'un `git revert` si la condition est
> jugée non remplie.

Sources lues : `git show 8b40308` (migration `20260525000000_fk_on_delete_rgpd.sql`), toutes
les migrations de `origin/main` qui référencent `classes`, les policies RLS sur `classes` et
`class_memberships`, `app/api/parametres/delete-account/route.ts`,
`supabase/migrations/20260517000000_anonymized_users.sql`, `app/api/classes/[id]/route.ts`
(DELETE de la PR 1), la carte board « PR 3 — LE VRAI VERROU » (`20260902010000_seed_board_cards_class_archive.sql`).

---

## 1. Pourquoi la PR 1 ne suffit pas

La PR 1 (`feat/class-delete-to-archive`, mergée) pose l'invariant **dans la route** : DELETE
seulement si la classe est archivée ET prouvablement vide (7 compteurs, fail-safe = refus).
Il tient tant qu'on passe par la route. Trois contournements existent aujourd'hui, tous côté
base :

| # | Contournement | Où | Gravité |
|---|---|---|---|
| C1 | `teacher_deletes_own_classes` : `ON classes FOR DELETE USING (teacher_id = auth.uid())`, sans clause `TO` (donc PUBLIC). Un prof avec la clé anon (déjà instanciée dans les pages) peut `from('classes').delete()` depuis la console : la cascade détruit memberships, devoirs, présences, tirages, audit. | `20260508100000:79` | critique (déjà sur la carte) |
| C2 | `teacher_manages_memberships` : `ON class_memberships FOR ALL` → autorise un vrai DELETE client sur une table règle 23. | `20260508100000:90` | haute (déjà sur la carte) |
| C3 | **Nouveau, trouvé en rédigeant ce plan** : `classes_tenant_scope` est `FOR ALL TO authenticated USING (school_id = current_user_school_id())`. Les policies permissives se combinent en OU : **tout utilisateur authentifié du même établissement — un élève compris — peut DELETE n'importe quelle classe de son école via PostgREST**, sans même être le prof. Même motif sur `assignments_tenant_scope`, `live_sessions_tenant_scope`, `teacher_schedule_slots_tenant_scope`. | `20260513140200:28-32` | **critique** — à carder (règle 17), pas corrigé ici |

Le DELETE de la PR 1 est exécuté par le client **service role** (`app/api/classes/[id]/route.ts:335`).
Le service role ignore la RLS mais **pas les contraintes FK** : un `RESTRICT` s'applique à lui
aussi. C'est exactement ce qu'on veut : la base refuse la destruction quel que soit le chemin
(route, PostgREST, psql, race entre deux requêtes).

## 2. Inventaire exhaustif des FK qui référencent `classes`

Neuf déclarations sur `origin/main`, huit colonnes distinctes (`live_sessions.class_id` est
déclarée deux fois, `CREATE TABLE` puis `CREATE TABLE IF NOT EXISTS`). Aucune n'a été
modifiée par une migration ultérieure (aucun `ALTER … class_id_fkey` dans l'historique) : les
noms de contrainte sont donc les noms par défaut de Postgres, `<table>_class_id_fkey` — **à
confirmer avec la requête d'inventaire du §6 avant d'écrire la migration**.

| Table.colonne | Migration | ON DELETE actuel | Ce que la cascade détruit aujourd'hui | Décision PR 3 |
|---|---|---|---|---|
| `class_memberships.class_id` | `20260508100000:49` | **CASCADE** | tous les memberships, y compris `status='removed'` (règle 23) | **→ RESTRICT** |
| `assignments.class_id` | `20260509100000:9` | **CASCADE** | les devoirs, et par transitivité `assignment_completions`, `assignment_question_answers`, `assignment_questions` (3 FK `ON DELETE CASCADE` vers `assignments`) — deux tables règle 23 | **→ RESTRICT** |
| `class_attendance_records.class_id` | `20260510010000:3` | **CASCADE** | l'historique de présence | **→ RESTRICT** |
| `student_random_picks.class_id` | `20260510030000:3` | **CASCADE** | les tirages au sort | **→ RESTRICT** |
| `class_audit_log.class_id` | `20260514200000:47` | **CASCADE** | le journal d'audit « immutable par RLS » (règle 23) | **décision à trancher, voir §4** |
| `teacher_schedule_slots.class_id` | `20260509140000:9` | SET NULL | rien : le créneau se détache | **garder** — un créneau d'horaire survit à sa classe, c'est la sémantique voulue |
| `live_sessions.class_id` | `20260510000000:6`, `20260514170000:28` | SET NULL | rien : la session se détache ; `live_session_answers` / participants restent via `session_id` | **garder** |
| `classes.parent_class_id` | `20260514180000:22` | SET NULL | rien : la sous-classe redevient orpheline | **garder** — un RESTRICT changerait la sémantique métier de la hiérarchie cohorte / sous-classe (option 2 explicite : pas de cascade de membership) |

FK **sortantes** de `classes`, à ne pas toucher dans cette PR mais à connaître :

- `classes.teacher_id → auth.users(id) ON DELETE CASCADE` (`20260508100000:19`). Voir §3.
- `classes.school_id → schools` (`20260513140100`) : clause ON DELETE non vérifiée ici ; hors sujet.

## 3. Ne rien défaire de la conformité RGPD de `8b40308`

`8b40308` (PR #128, Alex) a mis `ON DELETE SET NULL` sur **cinq FK vers `auth.users`**
(`assignments.assigned_by`, `exercises.teacher_id`, `exercises.validated_by`,
`class_attendance_records.recorded_by`, `student_random_picks.picked_by`) pour qu'une
suppression de compte n'échoue pas sur un `NO ACTION` et n'efface pas les rows événementielles.

**La PR 3 ne touche aucune FK vers `auth.users`.** Les huit FK du §2 pointent vers `classes`.
Les deux chantiers sont orthogonaux : `8b40308` protège la suppression d'un **utilisateur**,
la PR 3 protège la suppression d'une **classe**. Aucune des cinq colonnes de `8b40308` n'est
modifiée, aucune régression possible sur ce point.

Une interaction à documenter tout de même, sans la traiter :

- La doctrine produit est l'**anonymisation**, pas la suppression. `delete-account` n'appelle
  jamais `auth.admin.deleteUser` (commentaire explicite `route.ts:31` : la cascade détruirait
  les tables événementielles) ; il insère dans `anonymized_users`, retire les PII de
  `user_profiles`, et conserve les classes (`classesPreserved` dans l'audit). Aucun chemin du
  produit n'exerce donc `classes.teacher_id ON DELETE CASCADE`.
- Conséquence de la PR 3 : un `deleteUser` **hors produit** (dashboard Supabase, SQL) sur un
  prof dont les classes ont des memberships échouera désormais sur le RESTRICT au lieu de
  tout détruire en silence. C'est un durcissement cohérent avec la doctrine, pas une
  régression RGPD : le droit à l'effacement passe par `delete-account`. À écrire dans la PR.
- Passer `classes.teacher_id` en `SET NULL` (comme `8b40308` l'a fait pour `assigned_by`)
  n'est **pas** recommandé dans cette PR : la colonne est `NOT NULL`, portée par toutes les
  policies `teacher_id = auth.uid()` et par le code applicatif. Décision d'Alex, PR séparée.

## 4. La décision à trancher : `class_audit_log`

La carte disait : « une fois RESTRICT en place, l'exception assumée sur `class_audit_log` est
fermée par la base elle-même ». En relisant le trigger, **c'est plus radical que ça** :

- `classes_audit_changes` est `AFTER UPDATE` et journalise tout changement de `archived_at`
  (`20260514200000:84-86`).
- La PR 1 exige `archived_at IS NOT NULL` pour supprimer. Archiver écrit donc **toujours** au
  moins une ligne d'audit.
- Avec `class_audit_log.class_id ON DELETE RESTRICT`, **aucune classe archivée ne peut plus
  jamais être supprimée**, même vide. Le DELETE de la PR 1 devient inatteignable : la route
  renverrait 500 (erreur PG 23503 via `safeError`) sur toute classe qui passe les 7 compteurs.

Deux options cohérentes, une à choisir :

| | Option A — RESTRICT sur `class_audit_log` | Option B — `SET NULL` sur `class_audit_log.class_id` |
|---|---|---|
| Sémantique | L'archivage est **terminal**. Une classe n'est jamais supprimée. Le journal reste attaché à sa classe. | Une classe archivée **et vide** peut être supprimée (intention de la PR 1). Ses lignes d'audit restent en base, `class_id` à NULL, comme `8b40308` l'a fait pour les auteurs. |
| Migration | une ligne | `ALTER COLUMN class_id DROP NOT NULL` + re-création de la FK |
| Impact route PR 1 | à retirer ou à faire répondre 409 systématiquement ; les 35 tests actuels décrivent un comportement mort | inchangée ; les 35 tests restent exacts |
| Impact RLS `class_audit_log_teacher_read` | aucun | les lignes orphelines deviennent invisibles aux profs (`class_id IN (…)`) — acceptable, elles ne sont lisibles que par service role |
| Règle 23 | respectée strictement | respectée : aucune ligne effacée, attribution perdue seulement |

**Recommandation : Option B**, parce qu'elle garde la PR 1 vraie (la suppression d'une classe
vide était une décision produit validée par Claudia il y a dix jours) et qu'elle applique à
l'audit exactement la stratégie déjà adoptée par `8b40308`. Si Gaultier préfère « l'archive
est terminale » (Option A), il faut alors **retirer le DELETE de la route** dans la même PR
plutôt que de laisser un chemin qui échoue toujours en 500.

Dans les deux cas, garder l'exception assumée documentée dans les tests
(`class_audit_log` n'est pas compté par la route) : avec A elle devient inutile mais inoffensive ;
avec B elle reste exacte.

## 5. Fermeture des policies

Ordre de préférence : une policy **RESTRICTIVE** de refus plutôt qu'une chirurgie des policies
existantes. Les policies permissives se combinent en OU (c'est le bug C3) ; une policy
`AS RESTRICTIVE` se combine en ET et gagne quoi qu'un futur `FOR ALL` ajoute.

1. **`DROP POLICY teacher_deletes_own_classes`** — supprime la grant explicite (C1).
2. **`classes` : policy restrictive `FOR DELETE TO authenticated USING (false)`** — ferme aussi
   le DELETE accordé par `classes_tenant_scope FOR ALL` (C3). Sans elle, l'étape 1 ne change
   rien : le tenant scope suffit à supprimer.
3. **`class_memberships` : remplacer `teacher_manages_memberships FOR ALL`** par deux policies
   minimales, avec `TO authenticated` (la version actuelle est PUBLIC, sans `TO`) :
   - `FOR INSERT WITH CHECK (classe possédée)` ;
   - `FOR UPDATE USING (classe possédée) WITH CHECK (classe possédée)` ;
   - **pas de DELETE**. Ajouter la même policy restrictive `FOR DELETE USING (false)`.
   Impact applicatif : **nul**. Sur `origin/main`, le seul `.delete()` sur ces deux tables est
   celui de la route PR 1 (service role) ; les retraits d'élèves sont des `UPDATE status='removed'`
   côté service role (`app/api/student/classes/[id]/leave/route.ts:33`) ; `join` écrit via
   service role. Aucune page client n'écrit sur `class_memberships` (les 6 occurrences
   `from("class_memberships")` côté pages sont des SELECT).
4. Hors périmètre PR 3, **à carder** : découper `assignments_tenant_scope`,
   `live_sessions_tenant_scope`, `teacher_schedule_slots_tenant_scope` (tous `FOR ALL`) en
   SELECT / INSERT / UPDATE, ou leur ajouter la même restrictive anti-DELETE. Même vecteur que
   C3, autres tables.

Le service role continue de tout pouvoir (bypass RLS) : la PR 1 reste fonctionnelle, et c'est
le RESTRICT du §2 qui le tient, pas la RLS.

## 6. Plan de migration (esquisse, pas le code final)

Une seule transaction, idempotente (`DROP CONSTRAINT IF EXISTS` + `ADD`, `DROP POLICY IF EXISTS`),
aucune ligne modifiée. Ordre :

1. Inventaire préalable en prod, **lecture seule**, pour confirmer les noms de contrainte :
   ```sql
   SELECT conname, conrelid::regclass AS child, confdeltype
   FROM pg_constraint
   WHERE contype = 'f' AND confrelid = 'public.classes'::regclass
   ORDER BY child;
   ```
   Attendu : 8 lignes, `confdeltype` = `c` (cascade) ×5, `n` (set null) ×3.
2. Pour chacune des 4 (ou 5 avec l'option A) tables cascade : `DROP CONSTRAINT IF EXISTS
   <table>_class_id_fkey` puis `ADD CONSTRAINT … REFERENCES public.classes(id) ON DELETE RESTRICT`.
   Option B : `ALTER TABLE class_audit_log ALTER COLUMN class_id DROP NOT NULL` avant la FK en
   `SET NULL`. `COMMENT ON CONSTRAINT` avec le WHY (règle 23, PR 3).
3. Les trois policies du §5 (drop + restrictives + remplacement de `teacher_manages_memberships`).
4. Vérification post-migration : la même requête qu'en 1 ; `SELECT polname, polcmd, polpermissive
   FROM pg_policy WHERE polrelid IN ('public.classes'::regclass, 'public.class_memberships'::regclass)`.

Verrouillage : `ADD CONSTRAINT` prend un `ACCESS EXCLUSIVE` sur la table fille le temps de
revalider la FK (scan des lignes — tables petites, mais faire ça hors heures de cours, comme
la migration `20260913000000`). Rollback : re-créer les contraintes en `CASCADE`, aucune
donnée à restaurer.

Convention d'application : **éditeur SQL Supabase**, pas `supabase db push` (l'historique a
deux collisions de version, `20260515000000` et `20260902000000`, cf. audit des branches).

## 7. Tests à livrer avec la PR 3

Même outillage que `scripts/verify-migration-is-active-single-gate.sh` (Postgres jetable,
présent dans le conteneur) :

- **FK** : seeder une classe archivée + un membership `status='removed'` → `DELETE FROM classes`
  échoue en 23503 ; idem avec un devoir archivé, une présence, un tirage. Puis classe vide →
  DELETE passe (option B) et les lignes d'audit restent avec `class_id NULL`.
- **RLS** : `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub": "<prof>", …}'`
  → `DELETE FROM classes WHERE id = …` supprime 0 ligne, y compris pour le prof propriétaire et
  pour un élève du même `school_id` (le test qui casse si C3 revient).
- **Route** : ajouter un cas à `tests/api/classes-delete.test.ts` — le client admin renvoie
  une erreur 23503 sur le delete → 500, jamais 200 (le harnais `createFakeSupabase` le permet
  déjà via un handler `writes` en erreur).
- Les 35 tests actuels de la PR 1 restent verts sans modification (option B).

## 8. Hors périmètre, à carder (règle 17)

- **C3** — `*_tenant_scope FOR ALL` accorde DELETE à tout membre du tenant sur `classes`,
  `assignments`, `live_sessions`, `teacher_schedule_slots`, `teacher_organization_tags`.
  Priorité critique, à ouvrir sur le board avec le tag `found-by-claudy`.
- `classes.teacher_id ON DELETE CASCADE` vs doctrine anonymisation (décision Alex, §3).
- `class_memberships.student_user_id ON DELETE CASCADE` : même famille que `8b40308`, non
  traitée par cette PR.
