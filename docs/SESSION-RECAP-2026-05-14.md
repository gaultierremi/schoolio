# Session Recap — 2026-05-14

Session nuit : ingestion PDF → questions, diversification types, async UX.

---

## 🎯 Objectifs principaux

1. Diversifier les types de questions générées par Maïa (mcq seul → mcq + numeric + short_text)
2. Améliorer l'UX d'import (matière/année upfront, sidebar thèmes, étoiles cliquables)
3. Pipeline générateur fiable pour gros syllabus (176 pages → 600 q max)
4. Async job + progress bar UX (substeps + ETA)
5. Fallback provider AI si Gemini quota dépassé (Anthropic Claude Vision)
6. Phase 1 remédiation : link question ↔ concept

---

## ✅ PRs réalisées

### 🟢 Features livrées

#### Diversification types questions (Phase A)
- [#38](https://github.com/gaultierremi/schoolio/pull/38) — `feat(schema)` : types questions (mcq + numeric + short_text + multi_step), colonnes `expected_numeric_answer`, `numeric_tolerance`, `numeric_unit`, `expected_text_answers`
- [#41](https://github.com/gaultierremi/schoolio/pull/41) — `feat(generator)` : génération multi-type + cap 600/cours + distribution adaptée par matière
- [#40](https://github.com/gaultierremi/schoolio/pull/40) — `feat(quiz)` : rendu multi-type numeric + short_text côté élève
- [#39](https://github.com/gaultierremi/schoolio/pull/39) — `feat(grading)` : server-side `/api/grading/check-answer` multi-type

#### UX import & validation
- [#35](https://github.com/gaultierremi/schoolio/pull/35) — matière + année obligatoires upfront avant drop zone
- [#36](https://github.com/gaultierremi/schoolio/pull/36) — sidebar matière sur "à valider"
- [#37](https://github.com/gaultierremi/schoolio/pull/37) — difficulty stars cliquables (1/2/3)
- [#46](https://github.com/gaultierremi/schoolio/pull/46) — auto-scale volume questions (3 q/page) + sidebar thèmes/chapitres via champ `period`

#### Pipeline async + observabilité
- [#43](https://github.com/gaultierremi/schoolio/pull/43) — observabilité generate-questions + cap 20MB Gemini + UX (Confiance retirée)
- [#44](https://github.com/gaultierremi/schoolio/pull/44) — `feat(ai-router)` : Anthropic Claude comme provider Vision (fallback Gemini)
- [#50](https://github.com/gaultierremi/schoolio/pull/50) — pattern async job + table `question_generation_jobs` + status endpoint
- [#51](https://github.com/gaultierremi/schoolio/pull/51) — substeps + ETA progress UI (polling 2s sur jobId)
- [#48](https://github.com/gaultierremi/schoolio/pull/48) — copy banner import (600 max, multi-format, 2-4min)

#### Phase 1 remédiation
- [#34](https://github.com/gaultierremi/schoolio/pull/34) — link `question ↔ concept` (`concept_page_hint`) + fix bugs school_id

### 🔴 Bugs traités

- [#33](https://github.com/gaultierremi/schoolio/pull/33) — `fix(import)` : bug 500 création cours, `courses.school_id` manquant à l'insert
- [#42](https://github.com/gaultierremi/schoolio/pull/42) — `fix(generator)` : duplicate `school_id` property post-rebase dans `rows.map`
- [#45](https://github.com/gaultierremi/schoolio/pull/45) — `fix(ai-router)` : Anthropic provider model name `claude-sonnet-4-5` → `claude-sonnet-4-6` (le 4-5 n'existait pas → 0 question généré)
- [#47](https://github.com/gaultierremi/schoolio/pull/47) — `fix(ai-router)` : Anthropic streaming required pour ops > 10min (`messages.stream().finalMessage()` au lieu de `messages.create()`)
- [#49](https://github.com/gaultierremi/schoolio/pull/49) — `fix(generator)` : `maxDuration` 120→300s + 6 workers × 50q (anti-timeout Vercel)
- [#24](https://github.com/gaultierremi/schoolio/pull/24) — `fix(generate-questions)` : concurrence 6→2 + `Promise.allSettled` + `logError` par worker (debug stuck `phase=generating_workers`)

---

## 🗂️ Fichiers / surfaces touchés

| Surface | Fichiers clés |
|---|---|
| Generator | [app/api/courses/generate-questions/route.ts](app/api/courses/generate-questions/route.ts), [app/api/courses/generate-questions/[jobId]/status/route.ts](app/api/courses/generate-questions/[jobId]/status/route.ts) |
| AI Router | [lib/ai-router.ts](lib/ai-router.ts), [lib/ai-providers/anthropic.ts](lib/ai-providers/anthropic.ts) |
| Schema | `supabase/migrations/20260514230000_question_types_diversification.sql`, `20260514240000_ai_provider_anthropic_claude.sql`, `20260514250000_question_generation_jobs.sql` |
| Import UI | [app/school/import/page.tsx](app/school/import/page.tsx), `app/school/import/_components/GenerationProgress.tsx` |
| Questions UI | [app/school/questions/_components/SubjectSidebar.tsx](app/school/questions/_components/SubjectSidebar.tsx) |
| Quiz multi-type | `app/student/assignments/[id]/quiz/_components/` |

---

## ⚠️ Known issues (post-session)

**Bug critique non résolu** — Jobs stuck `phase=generating_workers, 0-1/6 workers completed`

- Observé sur jobs `5f877edd`, `a9d97c8d`, `c0c55ddf` après merge #50/#51
- Hypothèses : `waitUntil` Vercel killé sous concurrence 6× Anthropic streaming, ou throttle Anthropic
- PR #24 (mergée 02:54) baisse à **2 workers parallèles** + ajoute `logError` par worker → permettra de diagnostiquer post-redeploy
- **À retester** : upload chimie 7MB après redeploy Vercel — vérifier `error_logs.source = api.courses.generate-questions.worker`

---

## 📋 TODO restants

- [ ] **A.1** — Re-tester upload PDF (Histoire / Math / Chimie) après PR #24 redeploy + vérifier diversité types
- [ ] **Phase B grading** — migrer client check-answer → consumer `/api/grading/check-answer` (PR #39)
- [ ] **Phase 2** — corpus FWB pré-seed (CESS G)
- [ ] **Phase 3** — matching prof/canonique
- [ ] **Tech debt #2** — migration Trigger.dev pour vraie queue (vs `waitUntil` peu fiable)
- [ ] **Design** — unification reliquats dark theme (Sprint 4)
- [ ] **Dashboard student** — afficher sous-classes matière
- [ ] **Onboarding école** — auto-seed cohortes
- [ ] **PDF compression** — module optionnel (validé option C, on hold)

---

## 💡 Apprentissages

1. **`waitUntil` + parallel streaming Anthropic ≠ fiable** — investigation en cours, hotfix #24 baisse concurrence
2. **Anthropic streaming obligatoire > 10min** — `messages.stream().finalMessage()`, sinon SDK throw
3. **Modèles Anthropic** — `claude-sonnet-4-6` est le modèle courant, pas `4-5` (qui n'existe pas)
4. **Vercel `maxDuration`** — 300s = plafond Pro, doit être explicitement set même pour les routes avec `waitUntil`
5. **PostgrestError ≠ Error instance** — pattern `error instanceof Error` rate ces erreurs, prévoir fallback `String(error)`
6. **school_id NOT NULL pattern récurrent** — 3 bugs sur ce point cette session (#33, #34, #42) — checklist d'audit à formaliser
