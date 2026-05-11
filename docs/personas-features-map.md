# Schoolio — Features par user persona

## Vue d'ensemble (résumé table)

| Persona | Surface | Cas d'usage principal |
|---|---|---|
| Visiteur public | `/`, `/join`, `/join/[token]`, `/pub` | Découvrir, rejoindre une classe via code/lien |
| Élève "light" | `/student`, `/study`, `/train`, `/profile`, `/live/[code]`, `/student/assignments/*` | Faire les devoirs, écran "follower" en cours live |
| Élève "full" | Idem light + `/study/*`, `/train`, sessions IA personnelles | Étudier avec compte persistant cross-device |
| Élève beta-pending | `/beta-pending`, `/join` uniquement | Attendre/demander l'accès whitelist |
| Professeur | `/school/**`, `/api/courses/**`, `/api/classes/**`, `/api/live-sessions/**` | Créer classes, importer PDF, faire des cours live |
| Validator | `/school/questions` (onglets val) + propose-question | Valider/rejeter questions IA avant publication |
| School admin | (n'existe pas — un prof = sa propre école) | — |
| Super admin | `/admin/**`, sensitive routes | Whitelist, cache IA, invite teacher, board kanban |

---

## Visiteur public (non-authentifié)

### Pages accessibles
- `/` — `app/page.tsx` — Server Component (rend `LandingPage` si pas de user)
- `/join` — `app/join/page.tsx` — Server Component (formulaire `JoinClassForm` client)
- `/join/[token]` — `app/join/[token]/page.tsx` — Server Component (lookup classe par token, rend `JoinTokenClient`)
- `/pub` — `app/pub/page.tsx` — page promo standalone (iframe vers `/promo-standalone.html`)
- Note : middleware autorise `/`, `/login`, `/signup`, `/beta-pending`, `/join`. Toute autre route est libre s'il n'y a pas de user (sauf `/student`, `/school`, `/admin` → redirect `/`)

### Capabilities
- Voir la landing page (hero, sections, CTA `LandingCTA`)
- Cliquer sur "Se connecter avec Google" (OAuth via Supabase)
- Cliquer sur "Créer un compte"
- Saisir un code d'invitation classe sur `/join` (8 caractères, alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`)
- Suivre un lien d'invitation `/join/[token]` (UUID-like token, sans auth)
- Voir le mode d'auth d'une classe via token (full = email+password, light = pseudo)
- Choisir "Élève light" → fournir pseudo + prénom (+ nom optionnel)
- Choisir "Élève full" → fournir email + password + nom complet
- Voir la page promo `/pub` (iframe non-listée)

### API routes déclenchées
- POST `/api/classes/validate-token` — résout un token de lien d'invitation
- POST `/api/classes/validate-code` — résout un code d'invitation 8 chars
- GET `/api/join/preview` — preview classe par code
- POST `/api/classes/[id]/join-light` — crée compte synthétique pseudo + magic link auto-login
- POST `/api/classes/[id]/join-full` — crée compte email/password + auto signin
- POST `/auth/callback` (via route OAuth Google)

### Données vues
- Nom de la classe + nom du prof (via `validate-token`/`validate-code`)
- Mode d'auth de la classe (full ou light)
- Aucune donnée nominative d'élève ou de devoir

### Limitations
- Ne peut pas accéder à `/student`, `/school`, `/admin` (middleware redirige vers `/`)
- Ne peut pas voir le contenu des cours, questions, classes
- Ne peut pas créer de classe ou d'invitation
- Ne peut pas se connecter sans passer par Google OAuth ou par le flow `/join`
- Le mode "light" génère un email synthétique `pseudo-XXXX@class-YYYY.schoolio.local` — pas de récupération possible si l'élève change d'appareil

### Flows clés
- Landing → "Rejoindre une classe" → `/join` → code → join-light/full → `/student`
- Lien d'invitation prof → `/join/[token]` → pseudo OU email → `/student`
- Landing → "Se connecter" → Google OAuth → `/auth/callback` → middleware → si email pas whitelisté → `/beta-pending`

---

## Élève "light" (pseudo + compte synthétique)

### Pages accessibles
- `/student` — `app/student/page.tsx` — Server Component (dashboard agrégé)
- `/student/assignments/[id]` — `app/student/assignments/[id]/page.tsx` — Client Component
- `/student/assignments/[id]/quiz` — `app/student/assignments/[id]/quiz/page.tsx` — Client Component
- `/study` — `app/study/page.tsx` — Server (wrap `StudyWizard` client)
- `/study/session` — `app/study/session/page.tsx`
- `/study/review` — `app/study/review/page.tsx`
- `/study/stats` — `app/study/stats/page.tsx`
- `/train` — `app/train/page.tsx` — Server (gated par `getStudentAuthorizedSubjects`, restrictions actuelles à `histoire`)
- `/profile` — `app/profile/page.tsx` — Server (rend `ProfileEditor` + `MasteryDashboard` client)
- `/live/[code]` — `app/live/[code]/page.tsx` — Client (écran "slave" qui suit le PDF du prof + projection question)
- `/join` (peut rejoindre d'autres classes)

### Capabilities
- Voir son dashboard : streak, devoirs à venir, devoirs terminés, planning du jour, mastery par matière, cours disponibles, stats hebdo, lettre de note (B/C/D)
- Lister ses devoirs (pending, in_progress, completed, overdue)
- Ouvrir un devoir PDF — PDF affiché via URL signée + bouton "Marquer comme lu"
- Démarrer un quiz devoir : `start-quiz` → faire le quiz → `finish-quiz`
- Voir le planning du jour (filtré par `week_pattern_override`)
- Voir les cours disponibles de ses profs (PDFs) — accessibles via `/api/student/courses/[id]/pdf-url`
- Voir son explorateur de matières (`MasterySubjectGrid`)
- Voir le banner "AI Challenge" (`AIChallengeBanner`)
- Voir et fermer le tutoriel `StudentWelcomeOnboarding` (via `?welcome=1`)
- Voir/éditer son profil (pseudo, prénom, nom, avatar_color, active_skin, `unlocked_skins`)
- Choisir un skin parmi ceux unlock
- Voir son mastery par concept (`MasteryDashboard`)
- Lancer une session "Étudier" (`StudyWizard` → choisir source/sujet/nombre questions)
- Rejoindre un cours live en entrant le code 6 chars sur `/live/[code]` — voir le PDF du prof en temps réel (page, scroll, zoom) + voir une question projetée + voir la réponse révélée
- Recevoir une "random_pick" — banner "Tu es interrogé"
- Voir l'indicator "Schoolio écoute" si listening_active
- Quitter une classe : `/api/student/classes/[id]/leave`
- Se déconnecter (`SignOutButton`)

### API routes déclenchées
- GET `/api/student/dashboard` — agrégation lourde
- GET `/api/student/my-classes`
- GET `/api/student/classes`
- GET `/api/student/courses`
- GET `/api/student/assignments`
- GET `/api/student/assignments/[id]/pdf-url`
- GET `/api/student/assignments/[id]/course-pdf-url`
- POST `/api/student/assignments/[id]/start-quiz`
- POST `/api/student/assignments/[id]/finish-quiz`
- POST `/api/student/assignments/[id]/mark-read`
- POST `/api/student/dismiss-onboarding`
- GET `/api/student/courses/[id]/pdf-url`
- POST `/api/student/classes/[id]/leave`
- POST `/api/record-quiz-answer`
- POST `/api/study-session` (create / advance)
- POST `/api/study-progress`
- GET `/api/study-recommendations`
- GET `/api/spaced-repetition` (review queue)
- POST `/api/generate-questions` (IA pour Quiz study perso, sous quotas IA router)
- POST `/api/generate-explanation`
- POST `/api/adaptive-questions`
- GET `/api/live/[code]` — bootstrap session live
- GET `/api/live/[code]/pdf-url`
- GET `/api/live/[code]/projected-question`
- POST `/api/join` (rejoindre une autre classe avec un code)

### Données vues
- Ses propres `class_memberships` (status active)
- Les classes auxquelles il appartient (nom, level, subject)
- Tous les devoirs (`assignments`) de ses classes (non archivés)
- Ses `assignment_completions` (status, score)
- Ses `assignment_question_answers`
- Ses `student_random_picks`
- Les cours (PDF) des profs de ses classes (RLS scope `teacher_id IN teacherIds`)
- Le planning `teacher_schedule_slots` filtré par classe + jour + week_pattern
- Son propre `user_profiles` (pseudo, first_name, last_name, week_pattern_override, streak, etc.)
- `concept_mastery` de l'élève
- Les noms des profs de ses classes
- En live : `live_sessions.current_page/scroll_y/zoom/projected_question_id/show_answer/listening_active`
- En live : la question projetée + (si `show_answer`) la bonne réponse + l'explication

### Limitations
- Ne peut pas accéder à `/school/**` ou `/admin/**` (middleware redirige `/student`)
- Ne peut pas voir les devoirs/élèves d'autres classes
- Ne peut pas créer/éditer questions, cours ou devoirs
- Ne peut pas voir les "questions teacher" pending validation
- Pas d'accès au train adaptatif si aucune matière (ou seulement non-histoire) — page "bientôt"
- Compte synthétique : pas de récupération possible si appareil perdu (pseudo unique par classe)
- Pas d'email réel → ne peut pas changer d'appareil sans repasser par l'enseignant qui re-fournit le pseudo
- En live : interface "slave" en lecture seule — pas de contrôle viewport, pas de répondre aux questions interactivement

### Flows clés
- Reconnexion light : retape pseudo dans `/join/[token]` ou code → join-light détecte pseudo existant → magic link auto + redirect `/student`
- Faire un devoir PDF : `/student` → carte → "Ouvrir le PDF" → pdf-url signée → window.open → "Marquer comme lu" → completion = `completed`
- Faire un devoir quiz : `/student` → carte → "Démarrer le quiz" → `start-quiz` → `/student/assignments/[id]/quiz` → boucle answers → `finish-quiz` → score
- Cours live : prof partage code 6 chars → ouvrir `/live/[code]` → réceptionne Realtime updates + poll 5s

---

## Élève "full" (compte avec email)

### Pages accessibles
- Identiques à l'élève light : `/student`, `/study/**`, `/train`, `/profile`, `/live/[code]`, `/student/assignments/**`, `/join`

### Capabilities
- Toutes celles de l'élève light, plus :
  - Se reconnecter sur n'importe quel appareil avec email + password ou Google OAuth
  - Rejoindre plusieurs classes (même mode `full` ou `light`) avec le même compte
  - Récupération de mot de passe (via flow Supabase)
  - Première classe rejointe = celui qui détermine la beta-whitelist auto (insert avec `source: "class_invitation"`)

### API routes déclenchées
- Identiques à l'élève light
- POST `/api/classes/[id]/join-full` lors du premier join (signup) — peut aussi être déjà whitelisté

### Données vues
- Identiques à light, plus :
  - Profile `auth_mode: "full"` avec un vrai email
  - Plusieurs `class_memberships` possibles (un seul `class_id` n'est pas une contrainte)

### Limitations
- Mêmes limitations que light côté permissions (`role === "student"` enforcé par middleware)
- Mot de passe requis ≥ 8 caractères
- Email unique côté Supabase (erreur 409 si déjà utilisé)

### Flows clés
- Signup : `/join/[token]` → choisir mode full → email/password/firstName/lastName → auto signin
- OAuth Google direct depuis landing : `/auth/callback` → middleware vérifie whitelist → `/beta-pending` ou `/student`/`/school`
- Multi-classes : élève peut entrer un autre code sur `/join` après être déjà connecté
- Quitter une classe : `/api/student/classes/[id]/leave` puis re-join possible

---

## Élève en beta-pending (authentifié mais pas whitelisté)

### Pages accessibles
- `/beta-pending` — `app/beta-pending/page.tsx` — Server Component (avec `RequestForm` client)
- `/join` — `app/join/page.tsx` — toujours accessible (BETA_EXEMPT dans middleware)
- `/` — landing (toujours accessible)
- Toutes les autres routes auth (`/student`, `/school`, `/admin`) → redirect `/beta-pending`

### Capabilities
- Voir son email connecté
- Voir le statut actuel de sa demande : `none`, `pending`, `approved`, `rejected`
- Soumettre une demande d'accès (`RequestForm` → POST `/api/beta/request-access`) avec nom complet + message optionnel
- Se déconnecter (`SignOutButton`)
- Contacter par email `gaultierremi@gmail.com` (mailto)
- Rejoindre une classe via `/join` avec un code → le join-light/full insère automatiquement l'email dans `beta_whitelist` (source `class_invitation`) → débloque l'accès

### API routes déclenchées
- POST `/api/beta/request-access` — crée/met à jour `beta_access_requests`
- Routes `/join` et `/api/classes/[id]/join-*` (qui auto-whitelistent)
- POST `/auth/signout`

### Données vues
- Son propre email
- Son propre statut `beta_access_requests` le plus récent
- La landing publique

### Limitations
- Ne peut pas accéder à `/student`, `/school`, `/admin`, `/study`, `/train`, `/profile` (middleware redirige `/beta-pending`)
- Ne peut pas voir les classes, cours, devoirs
- Le middleware check whitelist à chaque request (avec cache cookie 1h `beta-checked={email}`)
- Kill switch : si `beta_whitelist` est vide → tout le monde passe (mode dev)

### Flows clés
- Signup Google → middleware → email pas whitelisté → redirect `/beta-pending` → fill form → wait approval admin
- Approval admin : Admin valide dans `/admin/beta-whitelist` → insert dans `beta_whitelist` → user re-login → middleware passe
- Bypass via classe : si prof envoie un code → join-light auto-insert dans whitelist → débloque l'accès au flow standard

---

## Professeur (school teacher)

### Pages accessibles
- `/school` — `app/school/page.tsx` — Client Component (dashboard avec KPIs)
- `/school/classes` — Client (liste classes)
- `/school/classes/new` — Server (création)
- `/school/classes/[id]` — Client (détail classe + invite section + onglets élèves/devoirs)
- `/school/classes/[id]/invite` — Client (page d'invitation présentable aux élèves)
- `/school/classes/[id]/assignments/new` — création devoir
- `/school/classes/[id]/assignments/[assignmentId]` — détail devoir + dashboard prof
- `/school/courses` — Client (liste cours avec filtres, tags, vue grid/list)
- `/school/courses/[id]/exercises` — exercices générés depuis le PDF
- `/school/courses/[id]/exercises/[exerciseId]` — détail exercice (validation par steps)
- `/school/courses/[id]/live` — `app/school/courses/[id]/live/page.tsx` — Client (cockpit prof live, master view)
- `/school/import` — Client (upload PDFs en masse + Gemini infer + génération questions)
- `/school/questions` — Client (CRUD questions + import PDF + bibliothèque HistoGuess)
- `/school/organization` — Client (gestion tags d'organisation)
- `/school/schedule` — Client (planning hebdo `teacher_schedule_slots` avec week_pattern A/B)
- `/school/session/new` — création de session générique
- `/profile` — profil prof
- `/study`, `/train` — accessibles aussi (un prof peut tester)

### Capabilities

**Classes**
- Créer une classe (`name`, `level`, `subject`, `auth_mode: full|light`) — code 6 chars auto-généré
- Lister ses classes (active/archived)
- Modifier (nom, niveau, matière, auth_mode)
- Archiver / restaurer / supprimer une classe
- Régénérer le code d'invitation ou le lien (token UUID)
- Inviter des élèves : copier code, partager lien d'invitation, voir page invitation
- Voir les membres actifs/retirés
- Retirer / réintégrer un élève
- Exporter la classe en CSV
- Régénérer le lien invitation (`invitation/regenerate`)

**Cours (PDFs)**
- Importer un ou plusieurs PDFs en drag&drop (`/school/import`)
- Génération auto title/subject/level via Gemini (rate-limited 15s entre calls, retry à 30s)
- Hash SHA256 du fichier pour déduplication (cache hit "reused")
- Upload vers Supabase Storage via URL signée PUT
- Éditer inline le sujet/niveau/titre suggéré par IA
- Valider en batch → générer questions sur tous les PDFs validés (concurrence 3)
- Lister ses cours avec filtres : matière, niveau, tags d'organisation
- Vue grid/list, preview/download PDF, supprimer (PDF supprimé, questions détachées)
- Tagger les cours avec tags d'organisation persos (couleurs, emojis)

**Questions**
- CRUD questions persos (`teacher_questions`)
- Importer des questions depuis un PDF (extraction IA `/api/extract-questions`)
- Valider / rejeter / unvalidate les questions générées par IA (selon difficulty stars 1-3)
- Activer "public" sur une question (`is_public`)
- Dupliquer une question
- Générer une explication IA pour une question
- Filtrer par type, période, sujet, niveau, origine, difficulté
- Tri par date, type, période
- Naviguer dans la bibliothèque HistoGuess publique → ajouter des questions au catalogue perso

**Live sessions**
- Démarrer un cours live sur un cours PDF, avec ou sans classe pour le suivi présence
- Code de session 6 chars, max 4h
- Master view : LivePdfViewer contrôlable (page, scroll, zoom)
- Side panel présences (`AttendanceRow` par élève : present/absent/late)
- Régénérer le code session (`regenerate-code`)
- Projeter une question (page-scope ou IA contextuelle)
- Révéler la bonne réponse (`show_answer` toggle)
- Mode "écoute" : `listening_active` → broadcast suggestions IA contextuelles (`listen-suggestions`)
- Random pick (tirer un élève) — `random-pick`, cancel possible
- Cockpit mobile (`TeacherCockpitMobile`)
- Terminer la session (`end`)

**Devoirs**
- Créer un devoir (resource_type pdf|quiz, due_date, class_id)
- Voir dashboard par devoir : nb completed/total, avg score, par élève
- Archiver un devoir
- Exporter un devoir CSV

**Planning**
- Créer / éditer / supprimer des slots horaires (`teacher_schedule_slots`)
- Mode semaine A/B (`week_pattern`)
- Personnaliser couleur, notes, label de matière
- Override semaine (`force_A`, `force_B`)
- Dismiss onboarding du planning

**Tags d'organisation**
- CRUD tags (nom, emoji, couleur parmi 8, description)
- Voir l'usage de chaque tag (nb courses/questions/classes)

### API routes déclenchées
- GET `/api/school/dashboard-summary`, `/api/school/stats`, `/api/school/recent-activity`
- GET `/api/school/schedule`, POST/PATCH/DELETE `/api/school/schedule/[id]`
- GET `/api/school/schedule/current-context`
- POST `/api/school/schedule/week-pattern-override`
- POST `/api/school/schedule/dismiss-onboarding`
- GET/POST `/api/classes`, `/api/classes/[id]`, PATCH/DELETE
- POST `/api/classes/[id]/regenerate-code`, `/regenerate-link`
- GET `/api/classes/[id]/members`, PATCH (status)
- GET `/api/classes/[id]/assignments`, POST
- GET `/api/classes/[id]/assignments/[assignmentId]/details`, `/dashboard`, `/export`
- GET `/api/classes/[id]/export`
- POST `/api/classes/[id]/attendance`
- POST `/api/classes/[id]/random-pick`, `/random-pick/[pickId]/cancel`, GET `/pick-stats`
- POST `/api/classes/[id]/invitation/regenerate`
- GET/POST `/api/courses`, GET `/api/courses/[id]`, DELETE
- POST `/api/courses/upload-url`, `/reupload`, `/infer-metadata`, `/generate-questions`
- GET `/api/courses/[id]/signed-url`
- GET/POST `/api/courses/[id]/exercises`, GET `/exercises/[exerciseId]`
- POST `/api/courses/[id]/extract-questions`, `/generate-exercises`
- POST `/api/courses/[id]/exercises/[exerciseId]/validate|reject|archive|restore`
- GET/POST `/api/teacher-questions`, PATCH/DELETE `[id]`
- PATCH `/api/teacher-questions/[id]/validation` (validate|reject|unvalidate + difficulty_stars)
- GET/POST `/api/teacher-tags`, PATCH/DELETE `[id]`, GET `/usage/[id]`
- POST `/api/live-sessions`, GET `/api/live-sessions/[id]`, POST `/end`, `/regenerate-code`
- PATCH `/api/live-sessions/[id]/page`, `/page-state`
- POST `/api/live-sessions/[id]/project-question`, `/back-to-pdf`
- POST `/api/live-sessions/[id]/listen-toggle`, `/listen-heartbeat`, `/listen-suggestions`
- POST `/api/live-sessions/[id]/record-answer`
- POST `/api/live-sessions/[id]/contextual-questions`
- POST `/api/propose-question` (publier une question vers le catalogue public, avec dedup similarity Levenshtein 85%)
- POST `/api/extract-questions`, `/api/generate-questions`, `/api/generate-explanation`
- POST `/api/record-quiz-answer`

### Données vues
- Toutes ses propres classes, cours, questions, exercices, devoirs, slots, tags
- Tous les élèves membres de ses classes (display name, status, joined_at)
- Toutes les completions/answers des élèves de ses classes
- Tout son `activity_events` (toHandle, timeline)
- Les questions publiques (bibliothèque HistoGuess) — `quiz_questions` status `approved`
- Pas accès aux questions ni élèves des autres profs
- Vue dashboard agrégée : pending_exercises, pending_questions, overdue_assignments, active_students, active_classes, validated_questions

### Limitations
- Ne peut pas voir les classes d'autres profs
- Ne peut pas accéder à `/admin/**` sauf si email dans `ADMIN_EMAILS`
- Ne peut pas modifier la whitelist beta (sauf si SUPER_ADMIN)
- Génération IA limitée par quotas providers (`ai_provider_quotas` table) — fallback cascade entre providers
- Gemini infer limité à 1 call / 15 sec (queue séquentielle côté front)
- Live session max 4h
- Doit être whitelisté (sauf si dans `ADMIN_EMAILS`) — `is_current_user_school_teacher` RPC enforced

### Flows clés
- Onboarding planning (modal `WelcomeScheduleOnboarding`) → dismiss → continue
- Créer classe → partager code/lien → premiers élèves rejoignent → dashboard `to_handle` se peuple
- Importer cours : drop PDFs → IA infère → éditer/valider → batch generate questions → questions arrivent en "pending" → tab "À valider" → validate/reject
- Faire un cours live : `/school/courses/[id]/live` → choisir classe → start session → projeter PDF → élèves scannent code et ouvrent `/live/[code]` → suivent en temps réel
- Random pick : tire un élève au hasard durant le live → notifie le slave + permet enregistrer un score

---

## Validator (Kenza, Christophe, Rémi)

### Pages accessibles
- Toutes celles d'un prof (Kenza/Christophe sont aussi profs sur la plateforme)
- Christophe + Rémi ont accès aux pages admin (présents dans `ADMIN_EMAILS`)
- `/school/questions` — page principale du validator

### Capabilities
- Toutes celles d'un prof, plus :
- Valider/rejeter les questions IA proposées (`PATCH /api/teacher-questions/[id]/validation` avec difficulty_stars)
- Proposer une question pour le catalogue public global (`POST /api/propose-question`) — passe par dedup Levenshtein
- Force-propose si jugement nécessaire malgré similarité
- Voir l'onglet "À valider" sur `/school/questions` avec badge count

### API routes déclenchées
- PATCH `/api/teacher-questions/[id]/validation` (`action: validate|reject|unvalidate`, `difficulty_stars: 1|2|3`)
- POST `/api/propose-question` (`questionId`, optional `forcePropose`)
- Insertion dans `quiz_questions` avec `status: pending` (public catalog)

### Données vues
- Toutes les questions de son propre `teacher_id` (RLS strict)
- La similarity check ne montre que sa propre source vs catalogue public
- Note : la liste `VALIDATOR_EMAILS` existe dans `lib/admin-config.ts` mais n'est pas directement enforcée par middleware — l'action validate/reject est ouverte à tout teacher pour ses propres questions

### Limitations
- Ne peut valider que ses propres questions (`question.teacher_id !== user.id` → 403)
- Pas de "validator board" global ni de queue centralisée
- La validation n'affecte que la propre liste prof — pour publier, doit passer par `propose-question`

### Flows clés
- IA génère questions → arrivent en "pending" pour le prof source → validator (= ce prof) valide avec rating étoiles → questions deviennent "validated"
- Validator décide qu'une question mérite d'être publique → toggle `is_public` ou `propose-question` → entry dans `quiz_questions` (status pending pour modération admin)

---

## School admin (multi-profs / écoles)

### Statut : N'EXISTE PAS dans la version actuelle

- Pas de table `schools` séparée
- Pas de table `school_admins`
- Pas de page `/school/admin` ni de scope multi-prof
- Chaque prof est isolé : ses classes, ses élèves, ses cours, ses questions
- La table `school_teachers` existe (utilisée par `admin/invite-teacher`) mais c'est une simple whitelist d'emails qui ont le droit d'être prof
- `is_current_user_school_teacher` RPC ne check qu'une appartenance individuelle, pas une école
- L'agrégation multi-prof se fait uniquement via le super admin (board kanban, beta-whitelist)

### Recommandation pour Miro
- Marquer comme "Feature non implémentée — à planifier si besoin gestion d'établissement"

---

## Super admin (gaultierremi@, alex.bourdouxhe@)

### Pages accessibles
- `/admin/board` — `app/admin/board/page.tsx` — Client (Kanban realtime + polling fallback 30s)
- `/admin/beta-whitelist` — `app/admin/beta-whitelist/page.tsx` — Server + `BetaAdminClient`
- `/admin/ai-router` — `app/admin/ai-router/page.tsx` — Server (quotas providers, logs, cache stats) + `ClearCacheButton`
- Layout `app/admin/layout.tsx` enforce `ADMIN_EMAILS` (Alex, Rémi, Christophe, Presti) — redirect `/` sinon
- Toutes les pages prof + élève accessibles

### Capabilities

**Board Kanban (admin/board)**
- Voir / créer / éditer / déplacer / archiver cartes (`admin_board_cards`)
- Drag&drop entre colonnes (backlog, in_progress, review, done)
- Filtres : type (task, bug, feature, idea, comment), priority (low/medium/high/critical), author
- Realtime via Supabase Channels + fallback polling 30s
- Notification Discord auto sur création/changement (`sendDiscordNotification`)
- Export `/api/admin/board/export`

**Beta whitelist (admin/beta-whitelist)**
- Lister les emails whitelistés (avec source : manual, class_invitation, etc.)
- Lister les demandes en pending
- Voir l'historique (approved/rejected) — 100 dernières
- Ajouter manuellement un email à la whitelist
- Approuver une demande : `POST /api/admin/beta-whitelist/approve/[request_id]`
- Rejeter une demande : `POST /api/admin/beta-whitelist/reject/[request_id]`
- Retirer un email de la whitelist : `DELETE /api/admin/beta-whitelist/[id]`

**AI Router (admin/ai-router) — SUPER_ADMIN only pour le cache**
- Voir les quotas par provider (OpenAI, Claude, Gemini, etc.) : requests_today/daily_limit
- Voir cooldowns actifs (rate-limit detection)
- Voir le flag EU compliant par provider
- Voir les 50 derniers logs requêtes IA (provider, task_type, status, latency, tokens)
- Voir les stats cache (entries actives, hits totaux)
- VIDER LE CACHE (`DELETE /api/admin/ai-router/cache`) — réservé `SUPER_ADMIN_EMAILS`

**Invite teacher — SUPER_ADMIN only**
- `POST /api/admin/invite-teacher` — ajoute un email à `school_teachers`
- Réservé strict `SUPER_ADMIN_EMAILS` (Alex + Rémi)

**Agent status (cron monitoring)**
- GET `/api/admin/agent-status` — état des background workers/agents

### API routes déclenchées
- GET/POST `/api/admin/board`, PATCH/DELETE `[id]`
- GET `/api/admin/board/export`
- GET/POST `/api/admin/beta-whitelist`, DELETE `[id]`
- POST `/api/admin/beta-whitelist/approve/[request_id]`
- POST `/api/admin/beta-whitelist/reject/[request_id]`
- DELETE `/api/admin/ai-router/cache` (SUPER_ADMIN only)
- POST `/api/admin/invite-teacher` (SUPER_ADMIN only)
- GET `/api/admin/agent-status`

### Données vues
- `admin_board_cards` : toutes cartes (tous auteurs confondus)
- `beta_whitelist` : tous emails
- `beta_access_requests` : toutes demandes (pending + history)
- `ai_provider_quotas`, `ai_request_logs`, `ai_response_cache` : tous providers
- `school_teachers` : tous profs whitelistés
- `agent_status` : tous workers

### Limitations
- Le clear cache et invite teacher sont restreints à SUPER_ADMIN_EMAILS (Alex + Rémi uniquement, pas Christophe ni Presti)
- Pas d'audit trail UI pour les actions admin (logged dans `audit_log` table immutable mais pas exposé en front)
- Pas de modification des quotas providers depuis l'UI (gérée en DB direct)
- Pas de reset des compteurs daily — se fait via cron côté DB
- Pas de UI pour gérer les `VALIDATOR_EMAILS` (constante hardcoded)

### Flows clés
- Approbation beta : user signup → middleware redirige `/beta-pending` → user soumet form → admin reçoit notif (Discord ?) → admin va sur `/admin/beta-whitelist` → approve → middleware passe au prochain login
- Quota IA atteint : provider sur cooldown → AI router cascade sur le suivant → admin voit dans `/admin/ai-router` → décide de clear cache si nécessaire
- Inviter un nouveau prof (Alex/Rémi only) : `POST /api/admin/invite-teacher` avec email → insertion `school_teachers` → prof peut maintenant signup et passer le check `is_current_user_school_teacher`
- Board ops : carte créée par n'importe quel admin → realtime broadcast → tout le monde voit en live → notif Discord pour les autres

---

## Annexe — Auth & rôles techniques

### Définition rôles
- Constantes `lib/admin-config.ts` :
  - `ADMIN_EMAILS` : gaultierremi@, alex.bourdouxhe@, christophe.lecrenier@, presti013@
  - `SUPER_ADMIN_EMAILS` : gaultierremi@, alex.bourdouxhe@
  - `VALIDATOR_EMAILS` : kenzaboulet26@, guevi4@, gaultierremi@, christophe.lecrenier@
- Métadonnée user `role`: `"student"` ou (implicite teacher si pas de role)
- Métadonnée user `auth_mode`: `"full"` ou `"light"`
- RPC `is_current_user_school_teacher` — Postgres function qui check appartenance à `school_teachers`

### Middleware (résumé)
- Public paths : `/`, `/login`, `/signup`
- Beta exempt : `/beta-pending`, `/join`
- Unauthenticated bloqué sur : `/student`, `/school`, `/admin` → redirect `/`
- Authenticated check beta whitelist (sauf ADMIN_EMAILS) → cookie cache 1h
- Role-based : `role=student` ne peut pas voir `/school` ou `/admin`, non-student ne peut pas voir `/student`
- Kill switch beta : si table vide → tout le monde passe

### Tables clés (RLS appliquée)
- `classes`, `class_memberships` (teacher_id scope)
- `courses` (teacher_id scope, RLS strict)
- `teacher_questions` (teacher_id scope)
- `teacher_schedule_slots` (teacher_id scope)
- `assignments`, `assignment_completions`, `assignment_question_answers`
- `live_sessions` (teacher_id scope, élèves lisent via code)
- `student_random_picks`, `class_attendance_records`
- `concepts`, `concept_mastery`, `question_concepts`
- `user_profiles` (id = auth.uid)
- `beta_whitelist`, `beta_access_requests`
- `admin_board_cards`, `audit_log` (immutable)
- `ai_provider_quotas`, `ai_request_logs`, `ai_response_cache`
- `school_teachers`, `teacher_organization_tags`
- `quiz_questions` (catalogue public global)

### Note "ce qui est visible mais cassé/incohérent"
- `/train` est gated sur la matière `histoire` uniquement — autres matières affichent "bientôt"
- Le mode "light" génère un email synthétique non-récupérable (pas de UX de reset)
- Aucune notion d'établissement scolaire — chaque prof est silo
- Le `VALIDATOR_EMAILS` n'est pas branché à l'enforcement de validation (juste documentaire)
- Pas de UI super-admin pour gérer la liste des admins / validators
