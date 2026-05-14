# Design audit — Maïa Light unification (2026-05-14)

## Contexte

PR #14 a déjà migré `/student/dashboard` et `/school/dashboard` (pages racines) vers
Maïa Light. Ce document liste **tous les reliquats** d'ancien dark theme repérés
dans `app/student/*`, `app/school/*` et `app/page.tsx`, et l'action prise dans
cette PR.

**Hors scope (exclusion explicite Alex) :** `app/admin/*` — Mission Control reste
en dark theme par choix produit.

## Tokens Maïa Light (rappel)

Définis dans `app/globals.css` :

```
--surface     : 255 255 255   /* fond carte */
--surface-2   : 252 250 248   /* fond doux */
--surface-3   : 247 245 250   /* tint accent */
--border      : 232 228 222
--ink         :  17  24  39   /* texte principal */
--ink-2       :  87  96 116   /* texte secondaire */
--ink-3       : 138 146 162   /* texte tertiaire / icônes off */
--accent      : 109  40 217   /* violet-700 */
--accent-2    : 124  58 237
--warm        : 245 158  11
--green       :  34 197  94
--red         : 239  68  68
```

Usage Tailwind v4 : `bg-[rgb(var(--surface))]`, `text-[rgb(var(--ink-2))]`,
`border-[rgb(var(--border))]`, etc.

Couleur Tuteur Maïa (cf. mockup `dashboard-eleve-session-mockup.html`) : sky-500
(`rgb(14 165 233)`). Couleur correction : green-600/700 (succès).

## Mapping dark → Maïa Light

| Dark theme (avant) | Maïa Light (après) |
|---|---|
| `bg-gray-950`, `bg-black`, `bg-zinc-9*` | `bg-[rgb(var(--surface))]` (page) ou `bg-[rgb(var(--surface-2))]` (zone calme) |
| `bg-gray-900`, `bg-gray-800` | `bg-[rgb(var(--surface))]` (card) ou `bg-[rgb(var(--surface-2))]` (input) |
| `text-white` | `text-[rgb(var(--ink))]` |
| `text-gray-300`, `text-gray-400` | `text-[rgb(var(--ink-2))]` |
| `text-gray-500`, `text-gray-600` | `text-[rgb(var(--ink-3))]` |
| `border-gray-800`, `border-gray-700` | `border-[rgb(var(--border))]` |
| `bg-purple-500`, `bg-purple-400` | `bg-[rgb(var(--accent))]` |
| `text-purple-400`, `text-purple-300` | `text-[rgb(var(--accent))]` |
| `bg-amber-500/10`, `text-amber-300` | `bg-[rgb(var(--warm))]/10`, `text-[rgb(var(--warm))]` |
| `bg-red-500/10`, `text-red-400` | `bg-[rgb(var(--red))]/10`, `text-[rgb(var(--red))]` |
| `bg-green-500/10`, `text-green-400` | `bg-[rgb(var(--green))]/10`, `text-[rgb(var(--green))]` |

Pour le tuteur (chat IA dans le quiz) → sky-500 préservé tel quel, fond clair :
`bg-sky-50`, `border-sky-200`, `text-sky-700`.

## Fichiers migrés

### Pages élève (`app/student/*`)

- `app/student/assignments/[id]/page.tsx` — détail devoir
- `app/student/assignments/[id]/quiz/page.tsx` — UI quiz (la plus visible !)
- `app/student/assignments/[id]/quiz/_components/MCQOptions.tsx`
- `app/student/assignments/[id]/quiz/_components/NumericInput.tsx`
- `app/student/assignments/[id]/quiz/_components/ShortTextInput.tsx`
- `app/student/assignments/[id]/quiz/_components/CorrectionPanel.tsx`
- `app/student/assignments/[id]/quiz/_components/TutorPanel.tsx`
- `app/student/live/page.tsx` — code de rejoin Quiz Prof Live
- `app/student/live/[code]/page.tsx` — session live élève

### Pages prof (`app/school/*`)

- `app/school/_components/WelcomeScheduleOnboarding.tsx`
- `app/school/classes/page.tsx`
- `app/school/classes/[id]/page.tsx`
- `app/school/classes/[id]/invite/page.tsx`
- `app/school/classes/[id]/invite/InvitePageClient.tsx`
- `app/school/classes/[id]/assignments/new/page.tsx`
- `app/school/classes/[id]/assignments/[assignmentId]/page.tsx`
- `app/school/courses/page.tsx`
- `app/school/courses/[id]/exercises/page.tsx`
- `app/school/courses/[id]/exercises/[exerciseId]/page.tsx`
- `app/school/courses/[id]/exercises/_components/PageRangeGenerator.tsx`
- `app/school/import/page.tsx`
- `app/school/organization/page.tsx`
- `app/school/questions/page.tsx` + tous les `_components/*`
- `app/school/schedule/page.tsx` + tous les `_components/*`
- `app/school/session/new/page.tsx`
- `app/school/live/[id]/page.tsx`

## Composants partagés non touchés (non utilisés hors `/admin`)

Vérifié par grep : les composants suivants utilisent encore du dark theme mais ne
sont **pas importés par les pages user-facing** que je migre. Hors scope de cette
PR (à traiter séparément si besoin) :

- `components/AuthButton.tsx`, `components/Header.tsx`, `components/QuizCard.tsx`,
  `components/ReviewCard.tsx`, `components/SubjectSelector.tsx`,
  `components/UserProfileCard.tsx`, `components/StudyWizard.tsx`
- `components/ui/ConfirmDialog.tsx`, `components/ui/ContextualQuestionCard.tsx`,
  `components/ui/CourseProgressCard.tsx`, `components/ui/LiveSessionTimer.tsx`,
  `components/ui/LoadingSkeleton.tsx`, `components/ui/PairingCodeDisplay.tsx`,
  `components/ui/PdfPageNavigator.tsx`, `components/ui/StudentPickBadge.tsx`,
  `components/ui/TabBar.tsx`, `components/ui/UnsupportedBrowserNotice.tsx`,
  `components/ui/WeeklyStatsBanner.tsx`, `components/ui/ZoomControls.tsx`
- `components/pdf/LivePdfViewer.tsx`, `components/teacher-live/*`

## Composants partagés (utilisés par pages user)

Non touchés dans cette PR — déjà migrés dans PR #14 ou utilisés uniquement
par admin :

- `components/StudentWelcomeOnboarding.tsx` — vérifié, déjà en Maïa Light
- `components/MarkdownLatex.tsx` — pas de classes hardcodées
- `components/pdf/PageRangeSlider.tsx` — composant input range, theme-agnostic
- `components/beta/BetaFeedbackButton.tsx` + `BetaFeedbackOverlay.tsx` — bouton
  flottant visible sur toutes les pages, déjà en Maïa Light

## Copy "IA" → "Maïa"

Audit grep `"IA"` ou `"l'IA "` en user-facing → aucun à remplacer (les copy
disent déjà "Maïa" partout). Memory feedback_no_ia_label_in_ux respecté.

## Vérification

- `npx tsc --noEmit` passe à chaque commit
- Test régression Mission Control : `/admin/*` non touché (vérification grep
  pré-migration : 0 fichier modifié sous `app/admin/`)
