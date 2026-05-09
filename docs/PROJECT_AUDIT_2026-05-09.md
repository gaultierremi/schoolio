# PROJECT AUDIT — Schoolio — 2026-05-09

> Rapport généré par audit automatisé. Destiné au PM (Claude Desktop).
> Branche courante : `feat/pdf-page-range-selection` (non mergée).

---

## 1. Stack & Infrastructure

### Versions exactes

| Lib | Version |
|-----|---------|
| Next.js | 14.2.3 |
| React | ^18 |
| TypeScript | ^5 |
| Tailwind CSS | ^4.2.4 |
| @supabase/supabase-js | ^2.105.3 |
| @supabase/ssr | ^0.10.2 |
| pdf-lib | ^1.17.1 |
| framer-motion | ^12.38.0 |
| katex / rehype-katex | ^0.16.45 / ^7 |
| react-markdown | ^10.1.0 |
| canvas-confetti | ^1.9.4 |

### Providers IA actifs

| Modèle | Usage | Fichiers |
|--------|-------|---------|
| `gemini-2.5-pro` | vision PDF (QCM, exercices, metadata, extract) — 1er choix | `infer-metadata`, `generate-questions`, `generate-exercises`, `extract-questions` |
| `gemini-2.5-flash` | fallback si Pro rate-limited (429) | idem |
| `claude-sonnet-4-6` | fallback ultime exercices, extract-questions, infer-metadata | `generate-exercises.ts`, `extract-questions`, `infer-metadata` |
| `claude-haiku-4-5-20251001` | adaptive questions, concepts, recommendations, generate-explanation | `lib/adaptive.ts`, `lib/concepts.ts`, `lib/recommendations.ts`, `api/generate-explanation` |

### Rate limiting

Pas de middleware centralisé. Chaque route API déclare une fonction locale `isRateLimitError()` qui détecte HTTP 429 + patterns `/rate.?limit|quota|resource.?exhausted/i`. Stratégie : Gemini Pro → Gemini Flash → Claude Sonnet → throw `ALL_MODELS_RATE_LIMITED`.

### Cache PDF

- Colonne `pdf_hash` (text) sur la table `courses`.
- Hash calculé via `createHash('sha256')` dans `api/courses/upload-url/route.ts` et `infer-metadata`.
- Pas de table dédiée `pdf_cache` — le hash est sur la ligne cours directement.
- TODO identifié : `// TODO: track system_cache_hit events when Gemini returns a cached response` (infer-metadata:363).

### Storage

Bucket Supabase `course-pdfs` (privé, 50 MB max, PDF only). Chemin : `user_id/course_id/filename.pdf`. 4 policies RLS storage (SELECT/INSERT/UPDATE/DELETE → own files only via `foldername[1] = auth.uid()`).

---

## 2. Architecture des routes

### Pages (`app/`)

```
/                                   landing ou dashboard selon auth            [public]
/pub                                page promo iframe HTML standalone          [public]
/join                               landing rejoindre une classe               [public]
/join/[token]                       rejoindre via lien token                   [public]

/train                              entraînement adaptatif SM-2 (concepts)     [auth]
/study                              dashboard d'étude personnelle              [auth]
/study/review                       session de révision flashcard              [auth]
/study/session                      session en cours                           [auth]
/study/stats                        statistiques d'étude                       [auth]
/profile                            profil utilisateur (avatar, son, streaks)  [auth]

/school                             dashboard prof (KPI, banner, planning)     [teacher]
/school/courses                     bibliothèque de cours (PDF)                [teacher]
/school/courses/[id]/exercises      exercices générés par cours                [teacher]
/school/courses/[id]/exercises/[id] détail + validation d'un exercice          [teacher]
/school/questions                   banque de questions QCM (validation)       [teacher]
/school/import                      import PDF + déclenchement génération IA   [teacher]
/school/organization                tags d'organisation des contenus           [teacher]
/school/classes                     liste des classes                          [teacher]
/school/classes/new                 créer une classe                           [teacher]
/school/classes/[id]                détail classe + membres + code invite      [teacher]
/school/classes/[id]/assignments/new        créer un devoir                    [teacher]
/school/classes/[id]/assignments/[id]       détail devoir + export             [teacher]
/school/schedule                    emploi du temps (grille timetable)         [teacher]
/school/session/new                 créer une session d'étude guidée           [teacher]

/student                            dashboard élève (classes, devoirs)         [student]
/student/assignments/[id]           détail devoir élève (PDF ou quiz)          [student]
/student/assignments/[id]/quiz      quiz d'un devoir                           [student]

/admin/board                        kanban admin (bugs, features, tasks)       [admin]
```

### API Routes (`app/api/`) — 65 routes

```
/api/courses                        CRUD cours                                [teacher]
/api/courses/[id]                   GET+DELETE cours par id                   [teacher]
/api/courses/upload-url             presigned URL S3 pour upload PDF          [teacher]
/api/courses/reupload               remplacer le PDF d'un cours               [teacher]
/api/courses/infer-metadata         inférer titre/matière/niveau via Gemini   [teacher]
/api/courses/generate-questions     générer QCM depuis PDF (3 workers)        [teacher]
/api/courses/[id]/signed-url        URL signée pour visualiser le PDF         [teacher]
/api/courses/[id]/generate-exercises  générer exercices guidés depuis PDF     [teacher]
/api/courses/[id]/exercises         liste exercices d'un cours                [teacher]
/api/courses/[id]/exercises/[id]    GET+PATCH exercice                        [teacher]
/api/courses/[id]/exercises/[id]/validate    valider exercice                 [teacher]
/api/courses/[id]/exercises/[id]/reject      rejeter exercice                 [teacher]
/api/courses/[id]/exercises/[id]/archive     archiver exercice                [teacher]
/api/courses/[id]/exercises/[id]/restore     restaurer exercice               [teacher]

/api/teacher-questions/[id]/validation  valider/rejeter une question QCM     [teacher]
/api/teacher-tags                   CRUD tags organisation                    [teacher]
/api/teacher-tags/[id]              PATCH+DELETE un tag                       [teacher]
/api/teacher-tags/usage/[id]        compter l'usage d'un tag                  [teacher]

/api/classes                        GET+POST classes                          [teacher]
/api/classes/[id]                   GET+PATCH+DELETE classe                   [teacher]
/api/classes/[id]/members           liste membres                             [teacher]
/api/classes/[id]/export            export CSV membres                        [teacher]
/api/classes/[id]/regenerate-code   nouveau code invite                       [teacher]
/api/classes/[id]/regenerate-link   nouveau lien token                        [teacher]
/api/classes/[id]/join-full         rejoindre (auth complète)                 [public]
/api/classes/[id]/join-light        rejoindre (auth légère sans email)        [public]
/api/classes/validate-code          valider code invite                       [public]
/api/classes/validate-token         valider token lien                        [public]
/api/classes/[id]/assignments       liste devoirs d'une classe                [teacher]
/api/classes/[id]/assignments/[id]  PATCH+DELETE devoir                       [teacher]
/api/classes/[id]/assignments/[id]/details  détail devoir avec completions    [teacher]
/api/classes/[id]/assignments/[id]/export   export résultats                  [teacher]

/api/school/dashboard-summary       KPIs dashboard prof                       [teacher]
/api/school/stats                   statistiques école                        [teacher]
/api/school/recent-activity         journal d'activité récente                [teacher]
/api/school/schedule                GET+POST créneaux emploi du temps         [teacher]
/api/school/schedule/[id]           PATCH+DELETE créneau                      [teacher]
/api/school/schedule/current-context  contexte horaire temps réel             [teacher]
/api/school/schedule/dismiss-onboarding  ignorer onboarding                  [teacher]
/api/school/schedule/week-pattern-override  forcer semaine A/B               [teacher]

/api/student/my-classes             classes de l'élève connecté               [student]
/api/student/assignments            devoirs de l'élève                        [student]
/api/student/assignments/[id]/start-quiz    démarrer quiz devoir              [student]
/api/student/assignments/[id]/finish-quiz   terminer quiz devoir              [student]
/api/student/assignments/[id]/mark-read     marquer PDF lu                    [student]
/api/student/assignments/[id]/pdf-url       URL signée PDF du devoir          [student]
/api/student/classes/[id]/leave     quitter une classe                        [student]

/api/admin/board                    GET+POST cartes kanban                    [admin]
/api/admin/board/[id]               PATCH+DELETE carte                        [admin]
/api/admin/board/export             export JSON toutes cartes                 [admin]
/api/admin/invite-teacher           inviter un prof par email                 [admin]

/api/spaced-repetition              calcul SM-2 (algo répétition espacée)    [auth]
/api/adaptive-questions             questions adaptatives par faiblesse        [auth]
/api/study-session                  créer/gérer session d'étude               [auth]
/api/study-progress                 progression par concept/matière           [auth]
/api/study-recommendations          recommandations d'étude                   [auth]
/api/generate-explanation           explication IA d'une réponse              [auth]
/api/extract-questions              extraire QCM d'un texte PDF via Gemini    [auth]
/api/generate-questions             générer questions depuis un concept       [auth]
/api/propose-question               proposer une question (élève?)            [auth]
/api/record-quiz-answer             enregistrer réponse quiz                  [auth]
/api/record-timeline-answer         réponse timeline historique               [auth]
/api/record-anachronism-answer      réponse jeu anachronisme                  [auth]
/api/image-proxy                    proxy image externe (éviter CORS)         [public]
```

---

## 3. Schéma DB

### Tables créées par nos migrations (20260504–20260509)

#### `courses`
| Colonne | Type |
|---------|------|
| id | uuid PK |
| teacher_id | uuid FK auth.users CASCADE |
| title | text NOT NULL |
| subject_enum | school_subject NOT NULL DEFAULT 'autre' |
| level | smallint (1–6) |
| chapter_number | integer |
| description | text |
| pdf_storage_path | text |
| pdf_hash | text |
| pdf_size_bytes | bigint |
| pages_count | integer |
| organization_tags | uuid[] |
| created_at / updated_at | timestamptz |

RLS : **désactivé** (`DISABLE ROW LEVEL SECURITY`). Accès via service role uniquement.  
Index : `(teacher_id, subject_enum, level)`, `(pdf_hash)`, GIN `(organization_tags)`.

#### `exercises`
| Colonne | Type |
|---------|------|
| id | uuid PK |
| course_id | uuid FK courses CASCADE |
| teacher_id | uuid FK auth.users |
| title | text NOT NULL |
| statement | text NOT NULL |
| exercise_type | text (calcul/demonstration/analyse/redaction/application/autre) |
| subject_enum | text |
| level | smallint |
| difficulty | smallint (1–3) |
| status | text (pending/validated/rejected/archived) |
| validated_at / rejected_at | timestamptz |
| validated_by | uuid FK auth.users |
| generated_by_model | text |
| page_range_start / page_range_end | smallint |
| created_at / updated_at | timestamptz |

RLS : 1 policy — teacher_manages_exercises (ALL WHERE teacher_id = auth.uid()).

#### `exercise_steps`
| Colonne | Type |
|---------|------|
| id | uuid PK |
| exercise_id | uuid FK exercises CASCADE |
| step_number | smallint |
| title | text |
| content | text NOT NULL |
| method_or_concept | text |
| is_final_answer | boolean NOT NULL DEFAULT false |
| created_at | timestamptz |

UNIQUE (exercise_id, step_number). RLS : 1 policy via JOIN exercises.

#### `classes`
| Colonne | Type |
|---------|------|
| id | uuid PK |
| teacher_id | uuid FK auth.users CASCADE |
| name | text NOT NULL |
| level | text |
| subject | text |
| auth_mode | text (full/light) |
| invite_code | text UNIQUE |
| invite_link_token | uuid UNIQUE |
| archived_at | timestamptz |
| created_at / updated_at | timestamptz |

RLS : 4 policies (SELECT/INSERT/UPDATE/DELETE — teacher owns).

#### `class_memberships`
| Colonne | Type |
|---------|------|
| id | uuid PK |
| class_id | uuid FK classes CASCADE |
| student_user_id | uuid FK auth.users CASCADE |
| joined_at | timestamptz |
| status | text (active/removed) |

UNIQUE (class_id, student_user_id). RLS : 2 policies (teacher or student sees own).

#### `assignments`
| Colonne | Type |
|---------|------|
| id | uuid PK |
| class_id | uuid FK classes CASCADE |
| assigned_by | uuid FK auth.users |
| title | text NOT NULL |
| description | text |
| resource_type | text (pdf/quiz) |
| resource_id | uuid |
| due_date | timestamptz |
| archived_at | timestamptz |
| created_at / updated_at | timestamptz |

RLS : 3 policies (teacher manages, student sees via membership).

#### `assignment_completions`
| Colonne | Type |
|---------|------|
| id | uuid PK |
| assignment_id | uuid FK assignments CASCADE |
| student_user_id | uuid FK auth.users CASCADE |
| status | text (pending/in_progress/completed) |
| completed_at | timestamptz |
| score | numeric(5,2) |
| duration_seconds | integer |
| attempts_count | integer DEFAULT 0 |
| last_attempt_at | timestamptz |
| created_at | timestamptz |

UNIQUE (assignment_id, student_user_id). RLS : 2 policies.

#### `teacher_organization_tags`
| Colonne | Type |
|---------|------|
| id | uuid PK |
| teacher_id | uuid FK auth.users CASCADE |
| name | text NOT NULL |
| emoji | text |
| color | text (8 valeurs enum) |
| description | text |
| created_at / updated_at | timestamptz |

UNIQUE (teacher_id, name). RLS : activé, aucune policy publique (service role only).

#### `admin_board_cards`
| Colonne | Type |
|---------|------|
| id | uuid PK |
| created_by | text (email) |
| type | text (bug/feature/idea/comment/task) |
| title | text NOT NULL |
| description | text |
| priority | text (low/medium/high/critical) |
| status | text (backlog/in_progress/review/done/archived) |
| assigned_to | text |
| tags | text[] |
| created_at / updated_at / completed_at | timestamptz |

RLS : activé, aucune policy publique. Trigger auto-set `completed_at` quand status→done.

#### `activity_events`
| Colonne | Type |
|---------|------|
| id | uuid PK |
| event_type | text NOT NULL |
| actor_id | uuid |
| actor_type | text (student/teacher/system) |
| target_type | text |
| target_id | uuid |
| teacher_id | uuid FK auth.users CASCADE |
| context | jsonb DEFAULT {} |
| created_at | timestamptz |

RLS : 2 policies (teacher SELECT own, service INSERT open).  
Index : `(teacher_id, created_at DESC)`.

#### `teacher_schedule_slots`
| Colonne | Type |
|---------|------|
| id | uuid PK |
| teacher_id | uuid FK auth.users CASCADE |
| day_of_week | smallint (0–6) |
| start_time / end_time | time (start < end) |
| week_pattern | text (all/A/B) |
| class_id | uuid FK classes ON DELETE SET NULL |
| subject_label | text |
| custom_color | text |
| notes | text |
| created_at / updated_at | timestamptz |

CHECK : `class_id IS NOT NULL OR subject_label IS NOT NULL`. RLS : 4 policies (teacher owns).

### Tables pré-existantes (antérieures aux migrations de ce repo)

> Schéma déduit du code — pas de migration `CREATE TABLE` dans ce repo.

| Table | Colonnes connues | Notes |
|-------|-----------------|-------|
| `user_profiles` | id, email, role (teacher/student), pseudo, auth_mode, first_name, last_name, sound_enabled, streak_freezes_used, streak_freezes_reset_at, last_streak_check, schedule_onboarding_dismissed, week_pattern_override | Extension auth Supabase |
| `teacher_questions` | id, teacher_id, question, options[], answer_index, subject_enum, level, course_id, validated_at, rejected_at, difficulty_stars, organization_tags, page_range_start, page_range_end | Banque QCM du prof |
| `quiz_questions` | id, type, question, options[], answer_index, explanation, period, difficulty, status, is_ai_generated, subject_enum, level | Questions publiques/admin |
| `concepts` | id, name, subject, subject_enum, level, is_auto_generated | Concepts SM-2 |
| `questions` | id, image_url, source_url, answer, hint, period, difficulty, status | Questions historiques (jeu anachronisme/timeline) |
| `duels` | id, code, difficulty, host_id, guest_id, status, host_score, guest_score | Duels entre joueurs |
| `timeline_events` | id, title, year, category, difficulty, status | Chronologie historique |
| SM-2 state | (tables review_state / study_progress — déduit de lib/adaptive.ts, lib/concepts.ts) | Algo répétition espacée |

### Enum SQL créé par migration

```sql
school_subject ENUM: histoire, chimie, physique, biologie, mathematiques,
                     francais, anglais, neerlandais, geographie, autre
```

---

## 4. Composants UI majeurs

### Dashboard prof (`app/school/_components/`)
| Composant | Rôle |
|-----------|------|
| `DashboardHeader.tsx` | Header avec nom prof + navigation |
| `KpiGrid.tsx` | Grille KPIs (questions, élèves, cours) |
| `CurrentClassBanner.tsx` | Bannière cours en cours/imminent (30s refresh, couleur live/amber) |
| `QuickActions.tsx` | Boutons actions rapides (import, schedule, etc.) |
| `ToHandleSection.tsx` | Questions et exercices à valider + suggestions planning |
| `ActivityTimeline.tsx` | Journal d'activité récente |
| `ClassesPreview.tsx` | Aperçu des classes du prof |
| `WelcomeScheduleOnboarding.tsx` | Modal onboarding premier emploi du temps |

### Emploi du temps (`app/school/schedule/_components/`)
| Composant | Rôle |
|-----------|------|
| `ScheduleGrid.tsx` | Grille timetable 7h–20h, 1px/min, 7 colonnes jours |
| `SlotModal.tsx` | Modal création/édition créneau (8 couleurs, classe ou label) |

### Génération IA (`app/school/courses/[id]/exercises/_components/`)
| Composant | Rôle |
|-----------|------|
| `PageRangeGenerator.tsx` | Modal sélection plage de pages + génération Q+E parallèle |

### Gestion cours / PDF (`components/pdf/`)
| Composant | Rôle |
|-----------|------|
| `PageRangeSlider.tsx` | Slider double-poignée pour sélectionner plage de pages |

### Classes (`components/classes/`)
| Composant | Rôle |
|-----------|------|
| `JoinClassForm.tsx` | Formulaire rejoindre une classe (code ou token) |
| `StudentClassCard.tsx` | Carte classe côté élève |

### Étude / Quiz (côté `components/`)
| Composant | Rôle |
|-----------|------|
| `StudyWizard.tsx` | Wizard session d'étude complète (933 lignes) |
| `QuizCard.tsx` | Card de quiz interactif (676 lignes) |
| `TrainingCard.tsx` | Card entraînement adaptatif SM-2 (661 lignes) |
| `ReviewCard.tsx` | Card révision flashcard |
| `MasteryDashboard.tsx` | Dashboard maîtrise par concept |
| `MasteryProgressBar.tsx` | Barre de progression maîtrise |
| `DailyStudyCard.tsx` | Card étude quotidienne |

### Profil / Layout
| Composant | Rôle |
|-----------|------|
| `Avatar.tsx` | Sélecteur d'avatar (347 lignes, multi-skins) |
| `ProfileEditor.tsx` | Éditeur profil complet (430 lignes) |
| `Header.tsx` | Header global |
| `AuthButton.tsx` | Bouton login/logout |
| `LandingPage.tsx` | Page d'accueil publique |
| `LandingCTA.tsx` | CTA de la landing |
| `UserProfileCard.tsx` | Card profil utilisateur |
| `SubjectSelector.tsx` | Sélecteur matière |
| `MarkdownLatex.tsx` | Rendu Markdown + LaTeX (KaTeX) |

---

## 5. Features livrées vs en cours

### ✅ Livré (sur `main`)

- **Import PDF + génération IA** : upload, infer-metadata (Gemini), generate-questions (3 workers parallèles), rate-limit avec fallback Gemini Flash → Claude Sonnet
- **Bibliothèque cours** : CRUD complet, PDF signé, re-upload, organisation par tags
- **Banque questions QCM** : génération, validation/rejet prof, filtres matière/niveau/statut
- **Organisation** : tags colorés, assignables à cours et questions
- **Exercices guidés** : génération IA (Gemini Pro/Flash/Anthropic), validation, étapes, statuts
- **Classes** : création, code invite + lien token, auth full/light, membres, export CSV
- **Devoirs** : création (PDF ou quiz), completion tracking élève, export résultats
- **Emploi du temps** : grille pixel-based 7h–20h, créneaux A/B/all, overlap check, CurrentClassBanner live
- **Dashboard prof** : KPIs, activité récente, onboarding, suggestions
- **Admin board** : kanban Trello-like, whitelist email, export JSON
- **Côté élève** : dashboard classes+devoirs, quiz devoir, mark-read PDF
- **SM-2 / Étude** : entraînement adaptatif, session, stats, révision flashcard
- **Profil** : avatar, son, streaks, préférences
- **Middleware routing** : protection /school /admin /student, pas de redirect depuis /

### 🟡 Sur branche non mergée

| Branche | Statut |
|---------|--------|
| `feat/pdf-page-range-selection` (**courante**) | Complète, build OK, **non mergée** — sélection plage pages pour Q+E |
| `feat/wow-effects` | Présente en local + remote — statut inconnu |
| `feat/admin-board-ui` | Local seulement — doublon avec board déjà en main ? |
| `feat/bulk-import` | Local seulement — import en masse, statut inconnu |
| `feat/import-generation` | Local seulement — probablement précédent du bulk-import |
| `feat/import-with-tags` | Local seulement |
| `feat/landing-page-redesign` | Local seulement |
| `feat/organization-onboarding` | Local seulement |
| `feat/school-dashboard-redesign` / `feat/school-dashboard-vision` | Local seulement — précédents du dashboard actuel |
| `feat/session-summary-screen` | Local seulement |
| `feat/subjects-and-pdf-extraction` | Local seulement — précédent de l'import |
| `feat/teacher-organization-ui` | Local seulement |
| `feat/theming-purple-phase-1` / `-phase-2` | Local seulement — thème violet |
| `feat/branding-favicon` | Local seulement |
| `feat/courses-list-page` | Local seulement |
| `coco/*` (9 branches) | Travail Coco — non mergé localement (admin-board-api, question-validation, migrate-to-gemini, etc.) |
| `codex/*` (7 branches) | Travail Codex — non mergé (stats, migrations, session cards, page-range-slider) |
| `fix/persist-ai-questions-and-progress` | Local seulement |
| `fix/sanitize-filename` | Local seulement |

> **⚠️ 35 branches locales non mergées.** La plupart semblent être des précédents historiques dont le contenu a été intégré manuellement dans main. À nettoyer.

### ❌ Manquant ou TODO

- `// TODO: track system_cache_hit events when Gemini returns a cached response` (`infer-metadata/route.ts:363`)
- Pas de notifications push élève (devoirs assignés)
- Pas d'interface élève pour voir ses exercices (seul le quiz PDF existe)
- Pas de système de duel (table `duels` et type existent, UI absente)
- Pas d'interface timeline/anachronisme visible dans app/ (API exist, pages absentes)

---

## 6. Côté élève — état actuel

### Ce qui existe

- `app/student/page.tsx` — dashboard élève : classes rejointes + devoirs assignés (PDF ou quiz)
- `app/student/assignments/[id]/page.tsx` — détail devoir
- `app/student/assignments/[id]/quiz/page.tsx` — quiz d'un devoir (QCM)
- 7 routes API dédiées `/api/student/`
- `StudentDashboardClient` (composant client dans student/)
- `components/classes/JoinClassForm.tsx` — rejoindre via code ou lien token
- `components/classes/StudentClassCard.tsx` — carte classe côté élève

### SM-2 côté élève

- L'algo SM-2 est dans `lib/adaptive.ts` (336 lignes) et `lib/concepts.ts` — branché à `/train`
- `/train` est accessible à tous les utilisateurs authentifiés (pas student-only)
- `api/spaced-repetition` enregistre les révisions
- Tables SM-2 pré-existantes (non visibles dans les migrations de ce repo)

### Role student dans user_profiles

Oui : `role text CHECK (role IN ('teacher', 'student'))` ajouté par migration `20260508100000`. Middleware utilise `user_metadata.role === "student"` pour router.

### Ce qui manque côté élève

- Pas d'accès aux exercices guidés (teacher-only pour l'instant)
- Pas d'interface pour les duels (type Duel existe)
- Pas d'interface chronologie/anachronisme (API existent, pas de pages)
- Le quiz `/student/assignments/[id]/quiz` prend le `resource_id` du devoir (course_id) — les questions viennent des `teacher_questions` validées

---

## 7. Dette technique identifiée

### Fichiers volumineux (> 500 lignes)

| Lignes | Fichier | Problème |
|--------|---------|---------|
| 2139 | `app/school/questions/page.tsx` | Monolithe — filtres, validation, génération, UI |
| 1370 | `app/school/organization/page.tsx` | Tags + cours + questions dans un seul fichier |
| 999 | `app/school/import/page.tsx` | Import complet inline |
| 933 | `components/StudyWizard.tsx` | Wizard avec logique métier interne |
| 817 | `app/school/courses/page.tsx` | Liste + upload + génération inline |
| 676 | `components/QuizCard.tsx` | UI + logique quiz mixées |
| 661 | `components/TrainingCard.tsx` | Idem pour l'entraînement |

### Composants potentiellement dupliqués

- `QuizCard.tsx` (676 lignes) vs `TrainingCard.tsx` (661 lignes) — logique similaire, audiences différentes (quiz devoir vs entraînement adaptatif)
- Pas de duplication avérée sur les Modals/Badges (pas de pattern répété trouvé)

### TODO / FIXME critiques

1. `infer-metadata/route.ts:363` — cache Gemini non tracé dans activity_events

### Imports circulaires

Aucun remonté par le build (build clean).

### Colonnes nullables potentiellement NOT NULL

- `exercises.subject_enum` — text NULL (devrait suivre `courses.subject_enum`)
- `exercises.level` — smallint NULL (idem)
- `teacher_questions.course_id` — uuid NULL (FK SET NULL accepté intentionnellement)
- `activity_events.actor_id` — uuid NULL (intentionnel pour events system)

### Index manquants

- `exercises` par `status` + `teacher_id` combiné (actuellement séparés)
- `assignments` par `due_date` (pas d'index, requêtes triées par date)
- `assignment_completions` par `student_user_id + status`

### RLS désactivé

- Table `courses` : RLS explicitement désactivé (`DISABLE ROW LEVEL SECURITY`). Protection via service role dans les routes API.

---

## 8. Variables d'environnement

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_AI_API_KEY
ANTHROPIC_API_KEY
BOARD_EXPORT_TOKEN
```

6 variables. Pas de Vercel-specific, pas de next-auth, pas de SMTP.

---

## 9. Points de friction connus

### Hacks documentés

Aucun `// HACK`, `// FIXME`, `// temporary`, `// quick fix` trouvé dans le code.

### Friction identifiée par lecture du code

- **Duplicate `isRateLimitError()`** : la même fonction de détection 429 est copiée dans 4 fichiers différents (`infer-metadata`, `generate-questions`, `generate-exercises`, `extract-questions`). Candidat évident à extraire dans `lib/`.
- **`courses` sans RLS** : seule table applicative sans RLS — protection uniquement via service role + vérification `teacher_id` dans les routes. Cohérent mais inhabituel.
- **`admin_board_cards` + `teacher_organization_tags` sans policies** : même pattern — RLS activé mais aucune policy publique, tout passe par service role + whitelist dans le code.
- **`pages_count` NULL pour cours existants** : la colonne existe depuis `20260505090000` mais n'était pas remplie avant le patch `infer-metadata`. Les cours importés avant la migration `20260509150000` ont `pages_count = NULL`. L'UI gère ce cas (fallback inputs).
- **35 branches locales** : état du repo difficile à lire, risque de confusion sur ce qui est réellement en main.

---

## 10. Surprises éventuelles

### Tables orphelines

- **`duels`** (déduite de `lib/types.ts`) : type `Duel` complet, routes API `record-quiz-answer` peut-être liée — mais aucune page visible dans `app/`. Fonctionnalité démarrée et abandonnée ?
- **`timeline_events`** (déduite de `lib/types.ts`) : type `TimelineEvent` + `api/record-timeline-answer` + `api/record-anachronism-answer` existent — aucune page visible. Même situation.

### Routes API sans page frontend évidente

- `/api/propose-question` — qui l'appelle ? Pas de page frontend identifiée.
- `/api/extract-questions` — distincte de `generate-questions` ; semble être une variante ancienne (extract depuis texte vs PDF entier).
- `/api/generate-questions` (à la racine `api/`) — différente de `/api/courses/generate-questions`. L'ancienne version sans contexte cours ?

### `lib/discord-notifications.ts`

Fichier Discord présent dans `lib/`. Aucune variable d'environnement Discord dans `.env.local`. Probablement désactivé/unused.

### Migration `20260505090000_create_courses.sql`

Contient un `CREATE TABLE IF NOT EXISTS` suivi d'un `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pour les mêmes colonnes — duplication défensive mais redondante.

### `app/pub/page.tsx`

Iframe vers `/promo-standalone.html` — fichier HTML statique non visible dans la liste des fichiers indexés. À vérifier qu'il existe dans `public/`.

### `codex/page-range-slider-component`

Branch Codex qui a créé `PageRangeSlider.tsx` — ce fichier a été accidentellement stagé dans le commit 4 de `feat/pdf-page-range-selection`. Le fichier est valide et utilisé, mais son origine est la branche Codex, pas la branche feature.

### Admin whitelist

`lib/admin-config.ts` contient 4 emails hardcodés (ADMIN + VALIDATOR). Pas de table DB pour ça — tout changement d'admin nécessite un deploy.

### Migration non appliquée en remote

`20260509150000_add_page_range_to_questions_and_exercises.sql` — sur la branche `feat/pdf-page-range-selection`, pas encore mergée. La migration doit être appliquée manuellement au remote avant/après le merge.

---

*Fin du rapport. Généré le 2026-05-09 sur `feat/pdf-page-range-selection`.*
