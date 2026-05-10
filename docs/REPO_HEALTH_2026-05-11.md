# Repo Health — Schoolio · 2026-05-11

> Snapshot généré le 2026-05-11 pour la réunion avec Christophe.

---

## 1. État Global

| Item | Valeur |
|------|--------|
| Branche courante | `main` |
| Working tree | ✅ Clean — rien à commiter |
| Sync origin | ✅ À jour (`a5d3a02`) |
| Build | (voir §7 — non lancé en CI local) |

---

## 2. Activité des 48h

**121 commits** sur `main` depuis 48h — sprint A2 complet + hotfixes live session.

### Commits récents (30 derniers)

| Hash | Il y a | Message |
|------|--------|---------|
| `a5d3a02` | 69 min | fix(api): direct REST fetch with service_role to bypass schema cache |
| `cdb2352` | 87 min | fix(api): return JSONB from RPC to bypass PostgREST column serialization |
| `6883301` | 2h | fix(api): bypass PostgREST schema cache via RPC for projected-question |
| `29f1f90` | 2h | fix(db): reload PostgREST schema so projected_question_id is visible in SELECT |
| `3402b14` | 2h | fix(live): fix back-to-pdf race condition and add evaluation buttons |
| `40248ce` | 3h | fix(api): use select(\*) and latest session for projected-question lookup |
| `74c41f9` | 3h | debug(api): trace projected-question session and question lookup |
| `bdd1ca0` | 3h | debug(live): add console.logs to slave fetchProjectedQuestion for tracing |
| `a6c1543` | 3h | fix(live): slave realtime subscription with proper status logging |
| `e86be9f` | 9h | fix(live): prevent automatic back-to-pdf cancellation on page change |
| `177efc5` | 10h | Merge branch 'feat/teacher-cockpit-suggestions' |
| `1d5e535` | 10h | Merge remote-tracking branch 'origin/codex/evaluation-buttons' |
| `c7f39e9` | 10h | fix(cockpit): functional state update in handleRevealAnswer |
| `442018e` | 10h | feat(slave): 3-mode display (pdf/question/answer) + Realtime resilience |
| `d482e34` | 10h | feat(cockpit): contextual question suggestions + QuestionFlowModal |
| `e150ed3` | 10h | feat(api): contextual questions + question projection for live sessions |
| `dfc720f` | 10h | feat(db): add live question projection and answer tracking |
| `47f2882` | 10h | feat(ui): add 4-button evaluation picker for live cockpit |
| `54fdc86` | 11h | Merge branch 'feat/teacher-cockpit-mobile' |
| `3bee465` | 11h | Merge remote-tracking branch 'origin/codex/contextual-question-card' |
| `bf967a6` | 11h | Merge remote-tracking branch 'origin/codex/student-pick-badge' |
| `a257237` | 11h | polish(cockpit): empty states, accessibility, pick count badges |
| `8d0f773` | 11h | feat(teacher-live): add mobile cockpit layout with random pick |
| `9fd4eb7` | 11h | feat(ui): add contextual question card for live cockpit |
| `642a7d5` | 11h | feat(api): random student pick with 30-day weighted distribution |
| `ebeb1ae` | 11h | feat(ui): add student pick count badge with color gradients |
| `833c8a3` | 11h | feat(db): add student_random_picks table |
| `4cc163d` | 11h | fix(pdf): stub pdfjs-dist server-side in Next.js 14 |
| `c505225` | 12h | fix(pdf): resolve react-pdf runtime error in Next.js 14 |
| `b2c6a22` | 12h | Merge branch 'feat/live-session-react-pdf' |

---

## 3. Branches

### Locales non mergées dans main

| Branche | Statut |
|---------|--------|
| `codex/letter-grade-badge` | 🟡 UI component isolé — candidat à merge ou suppression |
| `docs/roadmap-and-architecture` | 🟡 Documentation — à merger si à jour |
| `feat/session-summary-screen` | 🟡 Feature future — à garder ou archiver |
| `fix/student-flow-cleanup` | 🟠 Fix non mergé — vérifier si encore pertinent |

### Distantes non mergées

| Branche | Statut |
|---------|--------|
| `origin/docs/roadmap-and-architecture` | 🟡 Idem branche locale |

**Branches distantes obsolètes candidates à nettoyage** (mergées dans main mais toujours présentes) :
`codex/attendance-row`, `codex/confirm-dialog`, `codex/contextual-question-card`, `codex/evaluation-buttons`, `codex/join-class-form-component`, `codex/live-session-timer`, `codex/pairing-code-display`, `codex/pdf-page-navigator`, `codex/random-pick-animation`, `codex/student-class-card-component`, `codex/student-pick-badge`, `codex/tab-bar`, `codex/zoom-controls`, `codex/question-origin-badge`, `codex/loading-skeleton-component`, `codex/empty-state-component`, `feat/pdf-batch-rate-limiter`, `feat/teacher-cockpit-suggestions`, `feat/wow-effects`, `codex/migrations-vision-foundation` → **~20 branches à pruner**.

---

## 4. Structure du Projet

```
schoolio/
├── app/            152 fichiers  · 25 580 lignes TS/TSX
├── components/      36 fichiers  ·  8 876 lignes TS/TSX
├── lib/             26 fichiers  ·  2 702 lignes TS/TSX
├── supabase/migrations/  32 fichiers SQL
├── docs/            4 documents + 1 sous-dossier
├── public/          (pdf.worker, promo, assets)
└── scripts/         (copy-pdf-worker postinstall)
```

### Détail par couche

| Couche | Fichiers | Lignes |
|--------|----------|--------|
| `app/` (pages + routes API) | 152 | 25 580 |
| `components/` | 36 | 8 876 |
| `lib/` (utilitaires, types) | 26 | 2 702 |
| **Total code** | **214** | **37 158** |

---

## 5. Migrations DB

32 migrations au total · **7 ajoutées dans les 48h** (marquées ★)

| Fichier | Date | Sujet |
|---------|------|-------|
| `20260504120000` | 04 mai | streak + sound sur user_profiles |
| `20260504210000` | 04 mai | is_ai_generated sur quiz_questions |
| `20260504230000` | 05 mai | subject + level sur teacher_questions |
| `20260504235000` | 05 mai | subject + level sur concepts |
| `20260505090000` | 05 mai | create courses |
| `20260505090500` | 05 mai | storage bucket course_pdfs |
| `20260505160000` | 05 mai | course_id sur teacher_questions |
| `20260506000000` | 06 mai | admin board cards |
| `20260507000000` | 07 mai | question validation |
| `20260507100000` | 07 mai | teacher organization tags |
| `20260508100000` | 08 mai | classes & memberships |
| `20260509100000` | 09 mai | assignments (recreate) |
| `20260509110000` | 09 mai | name fields sur user_profiles |
| `20260509120000` | 09 mai | exercises & steps |
| `20260509130000` | 09 mai | activity events |
| `20260509140000` | 09 mai | teacher schedule |
| `20260509150000` | 09 mai | page_range sur questions & exercises |
| `20260509160000` | 09 mai | drop legacy histoguess |
| `20260509170000` | 09 mai | missing indexes |
| `20260509175000` | 09 mai | student onboarding |
| `20260509180000` | 09 mai | remove timeline master badge |
| `20260509190000` | 10 mai | quiz answer tracking |
| `20260509191000` | 10 mai | concept page hint |
| `20260509200000` | 10 mai | question origin |
| `20260509210000` | 10 mai | assignment questions |
| **★ `20260510000000`** | **10 mai** | **live_sessions (table principale)** |
| **★ `20260510010000`** | **10 mai** | **class attendance records** |
| **★ `20260510020000`** | **10 mai** | **live_sessions viewport** |
| **★ `20260510030000`** | **10 mai** | **student_random_picks** |
| **★ `20260510040000`** | **10 mai** | **live question projection + answers** |
| **★ `20260510050000`** | **10 mai** | **reload PostgREST schema** |
| **★ `20260510060000`** | **10 mai** | **RPC get_live_session_by_code** |

---

## 6. Dépendances

### Prod (13 packages)

| Package | Version |
|---------|---------|
| `next` | 14.2.3 |
| `react` / `react-dom` | ^18 |
| `@supabase/supabase-js` | ^2.105.3 |
| `@supabase/ssr` | ^0.10.2 |
| `react-pdf` | ^10.4.1 |
| `pdf-lib` | ^1.17.1 |
| `framer-motion` | ^12.38.0 |
| `@anthropic-ai/sdk` | ^0.92.0 |
| `@google/generative-ai` | ^0.24.1 |
| `react-markdown` | ^10.1.0 |
| `katex` / `rehype-katex` / `remark-math` | — |
| `canvas-confetti` | ^1.9.4 |

### Dev (5 packages)

`typescript ^5`, `tailwindcss ^4.2.4`, `postcss`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/canvas-confetti`

---

## 7. Métriques de Qualité

### Dette technique connue — Fichiers > 800 lignes

| Fichier | Lignes | Note |
|---------|--------|------|
| `app/school/organization/page.tsx` | 1 370 | 🔴 Candidat à découpage urgent |
| `app/school/import/page.tsx` | 999 | 🔴 Gros wizard d'import PDF |
| `components/StudyWizard.tsx` | 933 | 🟠 Wizard étude complet |
| `app/school/courses/page.tsx` | 817 | 🟠 Page principale cours |

### Composants UI réutilisables (`components/ui/` — 14 composants)

`AttendanceRow`, `ConfirmDialog`, `ContextualQuestionCard`, `EmptyState`, `EvaluationButtons`, `LiveSessionTimer`, `LoadingSkeleton`, `PairingCodeDisplay`, `PdfPageNavigator`, `QuestionOriginBadge`, `RandomPickAnimation`, `StudentPickBadge`, `TabBar`, `ZoomControls`

### TypeScript / Build

> Build et tsc non relancés pendant la session hotfix — à vérifier avant demo Christophe. Le dernier build Vercel est vert (deploy actif).

---

## 8. Fichiers Lourds

| Fichier | Taille | Note |
|---------|--------|------|
| `public/promo-standalone.html` | 1.6 MB | 🔴 Fichier HTML standalone promo — à sortir du repo |
| `public/pdf.worker.min.mjs` | 1.4 MB | 🟠 Worker pdfjs — copié par postinstall script, acceptable |
| `package-lock.json` | 78 KB | ✅ Normal |
| `app/school/organization/page.tsx` | 54 KB | 🔴 Fichier source trop dense |
| `app/school/import/page.tsx` | 39 KB | 🟠 |
| `components/StudyWizard.tsx` | 37 KB | 🟠 |
| `app/school/courses/page.tsx` | 36 KB | 🟠 |
| `docs/PROJECT_AUDIT_2026-05-09.md` | 31 KB | ✅ Document de travail |
| `app/school/courses/[id]/exercises/[exerciseId]/page.tsx` | 30 KB | 🟠 |
| `app/school/classes/[id]/page.tsx` | 29 KB | 🟠 |

---

## 9. Infrastructure API

**81 routes API** au total réparties en 5 domaines :

### Routes publiques (sans auth)
- `GET /api/live/[code]` — bootstrap session slave
- `GET /api/live/[code]/pdf-url` — URL PDF signé
- `GET /api/live/[code]/projected-question` — question projetée (slave)
- `POST /api/classes/validate-code` — validation code classe
- `POST /api/classes/validate-token` — validation token d'invitation
- `POST /api/classes/[id]/join-light` — inscription élève mode léger

### Routes teacher (`/api/courses/`, `/api/school/`, `/api/live-sessions/`)
- 8 routes courses (upload, extract, generate, exercises…)
- 7 routes school (dashboard, schedule, stats…)
- 9 routes live-sessions (start, end, page, project-question, back-to-pdf, record-answer…)
- 6 routes classes teacher (membres, assignments, attendance, export…)

### Routes student (`/api/student/`)
- 7 routes (my-classes, assignments, quiz, leave…)

### Routes admin (`/api/admin/`)
- 5 routes (board, export, invite-teacher)

### Routes AI
- `POST /api/courses/generate-questions` — Gemini batch
- `POST /api/courses/extract-questions` — Gemini extract
- `POST /api/propose-question` — suggestion contextuelle
- `POST /api/generate-explanation` — explication adaptative
- `POST /api/adaptive-questions` — spaced repetition

### Pages (30 au total)

| Zone | Pages |
|------|-------|
| Public | `/` (landing), `/pub`, `/live/[code]` (slave), `/join/[token]` |
| Auth teacher | `/school/*` (7 pages), `/admin/board` |
| Auth student | `/student/*`, `/study/*`, `/train` |
| Profile | `/profile` |

---

## 10. À noter pour Christophe

### ✅ Points forts

- **Vélocité** : 121 commits en 48h, sprint A2 complet (live session avec PDF sync, tirage aléatoire, questions contextuelles IA, affichage slave 3 modes)
- **Architecture propre** : séparation claire app/ (routes + pages) / components/ (UI réutilisables) / lib/ (métier pur)
- **14 composants UI réutilisables** bien isolés dans `components/ui/`
- **32 migrations Supabase** ordonnées chronologiquement, toutes avec commentaires
- **RLS systématique** sur toutes les tables avec policies nommées explicitement
- **Commit history lisible** : conventional commits (feat/fix/chore/docs)

### 🟠 Dette technique consciente

| Dette | Impact | Priorité |
|-------|--------|----------|
| `organization/page.tsx` à 1 370 lignes | Maintenabilité | Haute |
| `promo-standalone.html` (1.6 MB) dans le repo | Taille du repo | Haute |
| ~20 branches distantes stales à pruner | Confusion navigation | Moyenne |
| Logs debug en production (`[projected-question]`, `[Slave]`) | Pollution logs Vercel | Moyenne |
| Bug actif : PostgREST schema cache ne voit pas `projected_question_id` | Live session slave bloqué | **Critique — en cours** |
| 4 pages > 800 lignes (import, courses, studywizard) | Refactor futur | Basse |

### 🔴 Bug actif (en cours de résolution)

**PostgREST schema cache** : les colonnes `projected_question_id` et `show_answer` ajoutées à `live_sessions` ne sont pas visibles via l'API REST Supabase car PostgREST a été démarré avant leur ajout. La session slave reste bloquée en mode PDF.

**Workaround en cours** : `direct REST fetch` + logs diagnostics sur `app/api/live/[code]/projected-question/route.ts`.

**Fix définitif** : exécuter `SELECT pg_notify('pgrst', 'reload schema')` dans le SQL Editor Supabase OU aller dans Supabase Dashboard → Settings → API → **"Reload schema"**.

### 🗑️ Cleanup priorité haute

```bash
# Pruner les branches distantes obsolètes
git remote prune origin
git push origin --delete codex/attendance-row codex/confirm-dialog \
  codex/contextual-question-card codex/evaluation-buttons \
  codex/join-class-form-component codex/live-session-timer \
  codex/pairing-code-display codex/pdf-page-navigator \
  codex/random-pick-animation codex/student-class-card-component \
  codex/student-pick-badge codex/tab-bar codex/zoom-controls \
  codex/question-origin-badge feat/pdf-batch-rate-limiter \
  feat/wow-effects codex/migrations-vision-foundation

# Retirer promo-standalone.html du tracking git
echo "public/promo-standalone.html" >> .gitignore
git rm --cached public/promo-standalone.html
```
