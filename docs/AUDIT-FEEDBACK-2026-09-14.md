# Audit — « Envoie un retour à l'équipe Maïa » (modale feedback beta)

Date : 2026-09-14 · Auteur : Claudy · Périmètre : read-only, aucune modification de code.
Base auditée : `schoolio/main` @ `7baea39` (identique à `feat/sso-join-class` sur tous les fichiers cités).

---

## 0. Verdict en une phrase

**STUB côté front, backend complet mais jamais appelé, aucune lecture côté équipe.** Le bouton « Envoyer le retour » affiche « Retour envoyé ✅ » et n'envoie rien nulle part. Le micro est un faux qui injecte une phrase de test. La route API et les tables existent et sont de bonne qualité, mais rien ne les relie à la modale, et personne ne peut consulter ce qu'elles contiendraient.

| Couche | État | Preuve |
|---|---|---|
| Bouton flottant (toutes pages) | Monté, visible pour tout le monde | [app/layout.tsx:50](../app/layout.tsx#L50), [BetaFeedbackButton.tsx:19-20](../components/beta/BetaFeedbackButton.tsx#L19-L20) |
| Modale texte + catégorie + page | Fonctionnelle (UI seule) | [BetaFeedbackOverlay.tsx:46-50](../components/beta/BetaFeedbackOverlay.tsx#L46-L50), [l.86](../components/beta/BetaFeedbackOverlay.tsx#L86), [l.338](../components/beta/BetaFeedbackOverlay.tsx#L338) |
| Enregistrement vocal | **Simulé** (aucun `MediaRecorder`, aucun audio) | [BetaFeedbackOverlay.tsx:41-42](../components/beta/BetaFeedbackOverlay.tsx#L41-L42), [l.111-115](../components/beta/BetaFeedbackOverlay.tsx#L111-L115), [l.160-169](../components/beta/BetaFeedbackOverlay.tsx#L160-L169) |
| Envoi | **`console.log` uniquement**, aucun `fetch` | [BetaFeedbackOverlay.tsx:195-196](../components/beta/BetaFeedbackOverlay.tsx#L195-L196) |
| Toast « Retour envoyé ✅ » | Affiché sans condition après le `console.log` | [BetaFeedbackButton.tsx:37-40](../components/beta/BetaFeedbackButton.tsx#L37-L40), [l.64](../components/beta/BetaFeedbackButton.tsx#L64) |
| Route `POST /api/beta-feedback` | Complète, conforme aux règles, **jamais appelée** | [app/api/beta-feedback/route.ts](../app/api/beta-feedback/route.ts) |
| Tables `beta_feedback*` + RLS | Migrées, RLS activée, policies correctes | [20260515000000_beta_feedback.sql](../supabase/migrations/20260515000000_beta_feedback.sql) |
| Vue admin / notification / lien board | **Inexistants** | `grep beta_feedback app/ lib/ components/` → seul le fichier route |
| Classification IA (« Part 2 Edge Function ») | Jamais livrée ; colonnes `ai_*` mortes | `supabase/functions/` n'existe pas |
| Tests | Aucun (`tests/api` ne contient rien sur beta-feedback) | — |

---

## 1. Le flux complet, fichier par fichier

### 1.1 Point d'entrée

`BetaFeedbackButton` est monté dans le layout racine ([app/layout.tsx:50](../app/layout.tsx#L50)), donc sur **toutes** les pages, y compris `/`, `/login`, `/signup` et pour des visiteurs non connectés. Le gate est codé en dur : `const isVisible = true;` avec un TODO « gate on user_profiles.beta_tester once column exists » ([BetaFeedbackButton.tsx:19-20](../components/beta/BetaFeedbackButton.tsx#L19-L20)). La colonne existe depuis le 15 mai ([20260515010000](../supabase/migrations/20260515010000_add_beta_tester_to_user_profiles.sql)), le TODO n'a jamais été honoré.

### 1.2 La modale (`components/beta/BetaFeedbackOverlay.tsx`)

- **Page capturée** : `window.location.pathname` au moment de l'ouverture ([l.86](../components/beta/BetaFeedbackOverlay.tsx#L86)) et à l'envoi ([l.187](../components/beta/BetaFeedbackOverlay.tsx#L187)). Pathname seul, sans query string : bon choix, pas de fuite de tokens d'URL.
- **Catégorie** : trois pills Bug / Idée / Autre mappées sur `bug` / `feature_request` / `general` ([l.46-50](../components/beta/BetaFeedbackOverlay.tsx#L46-L50)). Optionnelle, `null` par défaut.
- **Texte** : textarea contrôlé ([l.338-347](../components/beta/BetaFeedbackOverlay.tsx#L338-L347)), compteur de caractères, aucun `maxLength`.
- **Contexte** : `document.title`, `navigator.userAgent`, `innerWidth x innerHeight`, durée « vocale » ([l.184-193](../components/beta/BetaFeedbackOverlay.tsx#L184-L193)).
- **A11y** : `role="dialog"`, `aria-modal`, focus trap Tab/Shift+Tab, Escape, restauration du focus. Propre.

### 1.3 L'enregistrement « vocal » : un simulateur

Il n'y a **aucun appel** à `MediaRecorder`, `getUserMedia`, `SpeechRecognition` ou à une API de transcription dans tout `app/`, `components/`, `lib/` (grep exhaustif). Ce que fait le bouton « Démarrer l'enregistrement » :

1. `handleToggleRecording` ([l.149-158](../components/beta/BetaFeedbackOverlay.tsx#L149-L158)) passe `isRecording` à `true`.
2. Un `setInterval` incrémente un compteur de secondes, et un `setTimeout` de 3 s ([l.111-115](../components/beta/BetaFeedbackOverlay.tsx#L111-L115)) appelle `appendMockTranscript()` puis arrête « l'enregistrement ».
3. `appendMockTranscript` ([l.160-169](../components/beta/BetaFeedbackOverlay.tsx#L160-L169)) concatène dans le textarea la constante `MOCK_TRANSCRIPT` :

   > « Ceci est un transcript de test. Adrien dit que le bouton X n'est pas visible sur Android. » ([l.41-42](../components/beta/BetaFeedbackOverlay.tsx#L41-L42))

Le libellé « Tape directement ou utilise le micro mocké. » ([l.295](../components/beta/BetaFeedbackOverlay.tsx#L295)) est donc exact : c'est un mock assumé, resté en prod. Conséquence pour un beta testeur réel : il clique sur le micro, parle 3 secondes dans le vide, et voit apparaître une phrase sur Adrien et Android dans son retour. Pas de fichier audio, pas d'upload, pas de bucket, pas de transcription. Il n'existe **aucun bucket Storage** lié au feedback (les seuls buckets migrés sont `course-pdfs`, `syllabi` et celui de concoursmd).

Note historique : un vrai hook micro a existé (`useMicPermission` / `useMicCapture`, commit `c97479c`, PR #17 « listen-mic-permission ») puis a été supprimé avec Schoolio Listen (`d21b169`). Il peut servir de référence si le vrai vocal est un jour implémenté.

### 1.4 L'envoi : nulle part

`handleSubmit` ([l.183-197](../components/beta/BetaFeedbackOverlay.tsx#L183-L197)) construit le payload, fait `console.log(payload)` et appelle `onSubmit(payload)`. Le parent ([BetaFeedbackButton.tsx:37-40](../components/beta/BetaFeedbackButton.tsx#L37-L40)) ignore le payload (`_payload`), ferme la modale et affiche le toast vert « Retour envoyé ✅ » pendant 2,6 s.

**Aucune requête réseau n'est émise. Rien n'est écrit en base. Le testeur reçoit une confirmation de succès mensongère.**

### 1.5 Le backend qui attend : `POST /api/beta-feedback`

La route existe sur `main` depuis le 12 mai (commit `1b1b4a7`, PR #18) et est conforme aux règles 4 à 7 du CLAUDE.md :

- Auth en première instruction via `requireUser()` ([route.ts:26](../app/api/beta-feedback/route.ts#L26)).
- Gate d'accès : `user_profiles.beta_tester = true` OU email dans `ADMIN_EMAILS` ([l.32-43](../app/api/beta-feedback/route.ts#L32-L43)), sinon 403.
- Validation de chaque champ : transcript string non vide ≤ 10 000, `input_method` et `suggested_type` sur enum, quatre champs contexte string ≤ 2 000, `duration_sec` entier ≥ 0 ([l.49-88](../app/api/beta-feedback/route.ts#L49-L88)).
- Insert via service role avec `user_id: auth.user.id` et `user_email_snapshot: auth.email`, jamais depuis le body ([l.94-107](../app/api/beta-feedback/route.ts#L94-L107)).
- Erreurs via `apiError` / `safeError` ([l.115](../app/api/beta-feedback/route.ts#L115)).

Il n'existe **pas de GET**, ni ici ni sous `app/api/admin/`.

### 1.6 Les tables ([20260515000000_beta_feedback.sql](../supabase/migrations/20260515000000_beta_feedback.sql))

- `beta_feedback` : contenu brut, contexte navigateur, 8 colonnes `ai_*` pour une classification jamais livrée, workflow admin (`status` à 7 valeurs, `assignee_id`, `duplicate_of_id`, `internal_notes`, etc.).
- `beta_feedback_comments`, `beta_feedback_status_history` : audit trail prévu, jamais alimenté (déjà relevé en D1 de l'[audit du 02/09](AUDIT-COMPLET-2026-09-02.md)).
- RLS activée sur les trois ([l.100-102](../supabase/migrations/20260515000000_beta_feedback.sql#L100-L102)). Policies `authenticated` : INSERT own, SELECT own, UPDATE `USING (false)` ; comments et history : INSERT `WITH CHECK (false)`, SELECT restreint aux propres feedbacks. Pas de policy DELETE, donc refus par défaut. Correct.
- CHECK constraints sur `input_method`, `suggested_type`, `ai_severity`, `status`. FK avec `ON DELETE SET NULL` / `CASCADE` explicites. Index sur `(status, ai_severity)`, `created_at DESC`, `(assignee_id, status)`. Conforme aux règles 8, 10, 11.

### 1.7 Après envoi : le vide

Aucun lecteur. `grep -rn beta_feedback app lib components` ne renvoie que la route POST. Pas de page `/admin/feedback`, pas de GET admin, pas de notification (mail, Slack, board), pas de trigger vers `admin_board_cards`. Les seuls moyens de lire un feedback aujourd'hui seraient le SQL editor Supabase ou le dashboard Table view.

---

## 2. État réel : pourquoi c'est resté à moitié

Chronologie (git) :

| Date | Commit / PR | Contenu | Sur main ? |
|---|---|---|---|
| 12 mai 12:32 | `8d447e1` feat(beta): add feedback voice shell | Modale + micro mock | Oui |
| 12 mai 15:22 | `1b1b4a7` (PR #18) Part 1 — schema, API route, shared types | Tables + route + `types/beta-feedback.ts` | Oui |
| 13 mai 01:40 | `ab5655e` (**PR #19**, repo `schoolio`) wire feedback overlay to backend | `fetch("/api/beta-feedback")`, `isSubmitting`, toasts 401/403/400/5xx | **Non** |
| 15 mai | `20260515010000` add beta_tester | Colonne + seed | Oui, appliquée en remote |

La PR #19 (`feat/beta-feedback-wire-post`) est **ouverte depuis le 13 mai, 0 review, 197 commits de retard sur main**. Un `git merge-tree --write-tree main origin/feat/beta-feedback-wire-post` produit aujourd'hui **3 conflits** (`BetaFeedbackOverlay.tsx`, `BetaFeedbackButton.tsx`, `types/beta-feedback.ts`) : main a depuis remplacé les icônes lucide par des SVG inline (sprint a11y) et enrichi `types/beta-feedback.ts`. Merger la PR telle quelle n'est plus possible ; il faut réappliquer la logique à la main (≈ 60 lignes utiles dans `handleSubmit` et l'état `isSubmitting`).

La branche `feat/beta-feedback-classification` ne contient rien de plus que main (elle pointe sur le merge de PR #18). La « Part 2 Edge Function » n'a jamais existé.

**Conclusion : le pont entre le front (stub) et le backend (prêt) n'a jamais été posé.** Le canal est mort à deux endroits : il n'écrit pas, et personne ne lit.

### 2.1 Deux points à vérifier en base (read-only) avant de conclure sur la prod

1. **La table `beta_feedback` existe-t-elle en prod ?** Le ledger `supabase migration list --linked` montre **deux fichiers locaux avec le même timestamp `20260515000000`** (`_beta_feedback.sql` et `_questions_is_active_toggle.sql`) pour **une seule** entrée remote. Impossible de savoir depuis le ledger lequel a été appliqué. Une requête `select count(*) from public.beta_feedback` tranche en 2 s.
2. **Adrien a-t-il vraiment le flag `beta_tester` ?** Le seed ([20260515010000:20](../supabase/migrations/20260515010000_add_beta_tester_to_user_profiles.sql#L20)) cible `'Adrien.jehaes@gmail.com'` avec une majuscule, alors que GoTrue stocke les emails en minuscules. Le `WHERE email IN (...)` est sensible à la casse : il est probable que le seul beta testeur terrain n'ait **pas** le flag et recevrait un 403 dès que le front sera branché. Les quatre admins, eux, passent par `ADMIN_EMAILS`.

---

## 3. Sécurité / RGPD

### 3.1 Voix d'un mineur : risque nul aujourd'hui, à concevoir avant le vrai micro

Aucun audio n'est capturé, transmis ni stocké. Le risque « bucket public avec la voix d'un élève » n'existe pas en l'état. Il devient réel dès qu'on implémente un vrai enregistrement ; ce point est traité dans le plan (§ 6) comme un sprint séparé, à ne **pas** improviser pour la beta.

### 3.2 Données personnelles présentes dans `beta_feedback`

| Donnée | Source | Qui peut la lire | Remarque |
|---|---|---|---|
| `user_id` | `auth.user.id` serveur | L'auteur (RLS `select_own`), service role | FK `ON DELETE SET NULL` : la ligne survit à la suppression du compte. |
| `user_email_snapshot` | `auth.email` serveur, `NOT NULL` | Idem | **Persiste après suppression du compte** puisque `user_id` passe à NULL mais l'email reste. Pour un mineur, c'est une rétention d'identifiant direct sans base légale documentée ni purge. |
| `transcript` | Texte libre | Idem | Peut contenir n'importe quoi (noms d'élèves, de profs). Pas de politique de rétention. |
| `user_agent`, `viewport`, `page_url`, `page_title` | Navigateur | Idem | Métadonnées techniques, faible sensibilité. `page_url` = pathname seul, sans query. |

**Un élève ne peut pas lire les feedbacks des autres** : `USING (auth.uid() = user_id)` ([migration l.112-115](../supabase/migrations/20260515000000_beta_feedback.sql#L112-L115)). Un élève ne peut ni modifier ni supprimer un feedback. La lecture admin ne peut passer que par service role, et aucune route ne le fait.

### 3.3 Surface d'exposition

- Le bouton est rendu pour les visiteurs anonymes. Une fois le front branché, ils recevraient un 401 : sans gravité mais confus (le commit `ab5655e` prévoyait le toast « Connecte-toi pour envoyer un retour »).
- Pas de secret ni de user_metadata manipulés. Le rôle beta vient de `user_profiles` lu en service role, pas du client. Conforme à la règle 3.

---

## 4. Robustesse

| Scénario | Comportement actuel | Verdict |
|---|---|---|
| Texte vide | Bouton « Envoyer » `disabled` ([Overlay l.367](../components/beta/BetaFeedbackOverlay.tsx#L367)) ; serveur 400 ([route l.49](../app/api/beta-feedback/route.ts#L49)) | OK, double barrière |
| Texte trop long | Serveur 400 au-delà de 10 000 ([route l.52](../app/api/beta-feedback/route.ts#L52)) ; **aucune limite côté textarea**, l'utilisateur découvre l'erreur après coup (ou jamais, puisque rien n'est envoyé) | Cosmétique |
| Upload vocal qui échoue | Sans objet, pas d'upload | — |
| Erreur réseau / serveur | Sans objet aujourd'hui : rien n'est envoyé, le toast succès s'affiche quoi qu'il arrive | **Bloquant** (fausse confirmation) |
| Double clic « Envoyer » | Pas d'état `isSubmitting` sur main (ajouté dans `ab5655e`) | À reprendre avec le branchement |
| Body JSON malformé | `req.json()` lève, rattrapé par `safeError` → 500 au lieu de 400 | Cosmétique |
| Spam par un beta testeur | **Aucun rate-limit** (aucun helper inbound dans `lib/`, aucun 429 dans `app/api`). Le gate `beta_tester` limite la population, pas le débit | Important |
| Feedback envoyé hors ligne (PWA, tablette classe) | Perdu silencieusement, pas de retry ni de file locale | Important pour un usage en classe |

---

## 5. Côté équipe : le vrai manque

Aujourd'hui Gaultier ou Adrien ne peuvent lire un feedback **qu'en ouvrant le SQL editor Supabase**. Il n'y a :

- ni page `/admin/feedback` (le dossier `app/admin/` ne contient que `board`, `founders`, `ai-router`) ;
- ni route GET admin ;
- ni notification (le seul canal existant côté équipe est `admin_board_cards`, alimenté par des seeds SQL et `POST /api/admin/board`) ;
- ni pont automatique feedback → board.

Le board admin est pourtant le bon réceptacle : il est déjà consulté, il a `type IN ('bug','feature','idea','comment','task')`, `priority`, `tags text[]`, `created_by text` ([20260506000000](../supabase/migrations/20260506000000_create_admin_board_cards.sql), recréé par [20260514120000](../supabase/migrations/20260514120000_restore_mission_control.sql)), et une page Kanban temps réel avec filtres type / priorité / auteur ([app/admin/board/page.tsx](../app/admin/board/page.tsx)). Le mapping est direct : `bug → bug`, `feature_request → feature`, `general → comment`, tag `beta-feedback`, `created_by = user_email_snapshot`.

---

## 6. Les trous, classés

### BLOQUANT pour la beta

| # | Trou | Preuve | Conséquence |
|---|---|---|---|
| B1 | Le bouton « Envoyer » n'envoie rien et confirme un succès | [Overlay l.195-196](../components/beta/BetaFeedbackOverlay.tsx#L195-L196), [Button l.37-40](../components/beta/BetaFeedbackButton.tsx#L37-L40) | 100 % des retours de la beta perdus, testeurs persuadés d'avoir été entendus |
| B2 | Le micro est un faux qui injecte une phrase de test | [Overlay l.41-42](../components/beta/BetaFeedbackOverlay.tsx#L41-L42), [l.111-115](../components/beta/BetaFeedbackOverlay.tsx#L111-L115), libellé [l.295](../components/beta/BetaFeedbackOverlay.tsx#L295) | Retours pollués, perte de crédibilité (« Adrien dit que le bouton X… » dans chaque vocal) |
| B3 | Aucune vue de lecture côté équipe | `grep` : aucun lecteur ; pas de GET | Même branché, le canal serait lu par personne |
| B4 | Existence de `beta_feedback` en prod non prouvée (timestamp de migration dupliqué) | § 2.1 | Le branchement pourrait 500 en prod |
| B5 | Adrien probablement sans flag `beta_tester` (casse de l'email dans le seed) | [20260515010000:20](../supabase/migrations/20260515010000_add_beta_tester_to_user_profiles.sql#L20) | 403 pour le premier beta testeur terrain |

### IMPORTANT

| # | Trou | Preuve |
|---|---|---|
| I1 | Pas de rate-limit sur le POST | Aucun helper inbound, aucun 429 dans `app/api` |
| I2 | `user_email_snapshot` persiste après suppression du compte, sans purge ni base légale documentée | [migration l.27-28](../supabase/migrations/20260515000000_beta_feedback.sql#L27-L28) |
| I3 | Aucune rétention définie pour `transcript` (texte libre pouvant nommer des mineurs) | — |
| I4 | Bouton visible pour les visiteurs anonymes et les non-beta | [layout.tsx:50](../app/layout.tsx#L50), [Button l.19-20](../components/beta/BetaFeedbackButton.tsx#L19-L20) |
| I5 | Pas de notification à la réception : le feedback dépend d'un admin qui pense à aller voir | — |
| I6 | Aucun test sur la route | `tests/api` vide sur ce sujet |
| I7 | Perte silencieuse hors ligne (usage tablette en classe) | Pas de retry |
| I8 | PR #19 ouverte depuis 4 mois, non mergeable (3 conflits), risque de re-tentative naïve | § 2 |

### Cosmétique

- Pas de `maxLength` sur le textarea (limite serveur 10 000 invisible).
- JSON malformé → 500 au lieu de 400.
- `BetaFeedbackOverlay` redéfinit localement `BetaFeedbackPayload` au lieu d'importer `types/beta-feedback.ts` ([types l.2-3](../types/beta-feedback.ts#L2-L3) le signale déjà).
- 8 colonnes `ai_*`, 2 tables (`comments`, `status_history`) et 7 statuts pour un workflow jamais construit : dette de schéma, pas un bug.
- Titre « Envoie un retour **vocal** à l'équipe Maïa » alors que le vocal n'existe pas.
- `createAdminClient()` redéfini localement dans la route (pattern répété ailleurs, domaine Alex).

---

## 7. Plan MINIMAL pour que ce soit fiable ET lu avant la beta

Objectif : un testeur qui clique « Envoyer » a la certitude que son retour est arrivé, et un admin le voit sans ouvrir Supabase. Pas de vocal réel pour la beta.

### P0 — indispensable (≈ 1 journée, 5 fichiers)

| Étape | Fichiers | Complexité | Détail |
|---|---|---|---|
| **1. Vérifier la prod** (read-only) | SQL editor | XS | `select count(*) from public.beta_feedback;` et `select email, beta_tester from user_profiles join auth.users using(id) where email ilike 'adrien.jehaes%';`. Si la table manque : appliquer la migration (renommer le fichier pour lever le doublon de timestamp). Si Adrien n'a pas le flag : `UPDATE` ciblé. |
| **2. Brancher le front** | `components/beta/BetaFeedbackOverlay.tsx`, `components/beta/BetaFeedbackButton.tsx` | S | Réappliquer à la main la logique de `ab5655e` : `fetch("/api/beta-feedback")`, `isSubmitting` (bouton et Escape verrouillés), toasts distincts 401 / 403 / 400 / réseau / 5xx, **toast succès uniquement sur 201**. Ne pas merger la PR #19 (conflits) ; la fermer avec un lien vers la nouvelle PR. |
| **3. Retirer le micro mock** | `BetaFeedbackOverlay.tsx` | XS | Supprimer `MOCK_TRANSCRIPT`, le bouton et le compteur, le texte « micro mocké » ; titre → « Envoie un retour à l'équipe Maïa ». `input_method` toujours `"text"`. Alternative acceptable : garder le bouton `disabled` avec un libellé « Vocal bientôt disponible ». |
| **4. Gate de visibilité** | `BetaFeedbackButton.tsx` (ou un wrapper serveur) | XS | Ne pas rendre le bouton pour un visiteur non connecté (au minimum). Idéalement lire `beta_tester` / admin côté serveur et passer un booléen. |
| **5. Vue admin de lecture** | `app/api/admin/feedback/route.ts` (GET, `requireAdmin()`, service role, tri `created_at desc`, filtre `status`), `app/admin/feedback/page.tsx` (tableau : date, email, type, page, transcript, statut) | S–M | Lecture seule suffit pour la beta. Réutiliser le layout `/admin` qui gate déjà sur `ADMIN_EMAILS`. |

### P1 — fortement recommandé avant la beta (≈ ½ journée)

| Étape | Fichiers | Complexité | Détail |
|---|---|---|---|
| **6. Feedback → carte board automatiquement** | 1 migration | S | Trigger `AFTER INSERT ON beta_feedback` (SECURITY DEFINER, `SET search_path = ''`) qui insère dans `admin_board_cards` : `type` mappé (`bug→bug`, `feature_request→feature`, `general→comment`), `title = left(transcript, 200)`, `description = transcript || page || email`, `tags = '{beta-feedback}'`, `created_by = user_email_snapshot`, `priority = 'medium'`. Le retour tombe dans le flux que l'équipe regarde déjà, avec Realtime. C'est la réponse la moins chère à « un canal qui reçoit sans qu'on lise ». |
| **7. Rate-limit** | `app/api/beta-feedback/route.ts` | XS | Avant l'insert : `count` des rows du user sur les 10 dernières minutes en service role ; 429 au-delà de 5. Pas besoin d'infra externe. |
| **8. Rétention RGPD** | Doc + 1 migration ultérieure | XS | Décider : anonymiser `user_email_snapshot` à la suppression du compte (trigger sur `auth.users` ou job), purge des transcripts à N mois. À écrire dans la politique de confidentialité avant la beta. |
| **9. Tests route** | `tests/api/beta-feedback.test.ts` | S | 401, 403 non-beta, 400 par champ, 201 nominal, 429. Domaine Claudia. |

### P2 — après la beta

- Vrai vocal : sprint dédié avec design RGPD préalable (bucket **privé**, chemin `user_id/uuid.webm`, policy Storage service-role only, taille max 60 s / 2 Mo, transcription serveur, suppression de l'audio après transcription ou rétention courte documentée, consentement explicite pour les mineurs). Référence de code : `c97479c` (`useMicPermission`, `useMicCapture`).
- Workflow admin (statuts, commentaires, assignation) sur les colonnes déjà en place.
- Nettoyage des colonnes `ai_*` si la classification n'est pas planifiée.

### Ce que ce plan ne fait pas

Aucune modification de `lib/api/*` ni `lib/db/*` (domaine Alex). Les étapes 2 à 5 sont un sprint > 3 fichiers : **review Claudia recommandée** avant GO, conformément à la règle 21.

---

## 8. Ce qui est sain

- **La route API est exemplaire** au regard des règles 4 à 7 : auth d'abord, gate d'accès, validation champ par champ, identité depuis `auth` et jamais depuis le body, `apiError` / `safeError`, service role uniquement côté serveur.
- **Le schéma est bien pensé** : RLS active partout, CHECK sur tous les enums, FK avec `ON DELETE` explicite, index utiles, survie des lignes à la suppression du compte (utile pour les stats, à équilibrer avec I2).
- **La séparation front / back par des types partagés** (`types/beta-feedback.ts`) est en place.
- **La modale est accessible** (dialog, focus trap, Escape, aria) et capture un contexte utile (page, viewport, UA) sans query string.
- **Le gate `beta_tester` existe** et évite qu'un utilisateur quelconque remplisse la table.
- **La logique de branchement a déjà été écrite et déployée en preview** (`ab5655e`, Vercel preview OK le 13 mai). Elle n'est pas à concevoir, seulement à réappliquer.

---

## Annexe — commandes utilisées (toutes read-only)

```
git ls-files | grep -iE "feedback|record|micro|voice|audio"
grep -rn "MediaRecorder|getUserMedia|SpeechRecognition" app components lib
grep -rn "beta_feedback|beta-feedback" app lib components
git log --all --oneline -- components/beta app/api/beta-feedback
git merge-base --is-ancestor ab5655e main            # → non
git merge-tree --write-tree main origin/feat/beta-feedback-wire-post   # → 3 conflits
gh pr view 19 -R gaultierremi/schoolio               # OPEN, 0 review
npx supabase migration list --linked                 # doublon 20260515000000
```
