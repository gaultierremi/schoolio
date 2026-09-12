# Audit des branches distantes — Maïa

**Date** : 2026-09-02 · **Référence** : `origin/main` = `b91c7d2` · **Méthode** : lecture seule. Aucune branche supprimée, aucun push, aucune modification de code hors ce fichier.

---

## Résumé exécutif

**121 branches distantes** (hors `main`). La conclusion tient en une phrase : **110 d'entre elles n'ont aucun ancêtre commun avec `main`**.

`git merge-base origin/main origin/codex/tab-bar` sort en code 1. Ce n'est pas une anomalie isolée : `main` compte **63 commits, trois commits racines, et rien avant le 2026-05-17**. L'historique du projet a été recréé à cette date. Les branches d'avant remontent, elles, jusqu'à **347 commits et au 2026-05-04**.

Conséquence immédiate et contre-intuitive : `git branch -r --merged origin/main` ne renvoie que 2 branches, et **ce chiffre ne veut rien dire**. Aucun outil git fondé sur l'ascendance (`--merged`, `merge-base`, `git cherry`, `rev-list --count`) ne produit un verdict fiable sur ce dépôt. Tout ce rapport repose donc sur une comparaison de **contenu**.

**115 branches sur 121 n'ont pas bougé depuis mai 2026** — quatre mois. Les 6 restantes datent d'aujourd'hui et sont toutes du travail en cours légitime.

Le travail des branches de mai est, sauf exceptions listées plus bas, **déjà dans `main`** : il y a été réintégré au moment de la réécriture. Les grands chantiers soupçonnés d'être abandonnés ne le sont pas — le pipeline B est complet et mergé, il n'attend qu'une étape de QA jamais faite ; les correctifs de robustesse du générateur ont survécu au refactor ; la campagne de composants `codex/*` a bien livré ses fichiers dans `main`, même si beaucoup n'y sont jamais importés.

⚠️ **Le point le plus important de ce rapport n'est pas combien de branches supprimer, mais ce qu'on détruit en les supprimant** : l'historique du projet antérieur au 17 mai n'existe **que** dans ces branches. Supprimer les 110 branches disjointes efface définitivement les six premières semaines de l'histoire de Maïa.

---

## La fracture d'historique

C'est le fait structurant, à comprendre avant de lire le tableau.

| | `origin/main` | Les branches de mai |
|---|---|---|
| Commits | 63 | jusqu'à 347 |
| Commit le plus ancien | 2026-05-17 | 2026-05-04 (`Initial commit from Create Next App`) |
| Commits racines | **3** | 1 |
| Ancêtre commun avec l'autre | **aucun** | **aucun** |

La racine la plus ancienne de `main` est `feat(a11y): sprint 1.5 polish PR 1 — eslint jsx-a11y + skip link + lang fr-BE (#86)`. Le contenu d'avant est bien là — les fichiers, les migrations, le produit — mais **les commits qui l'ont produit ne le sont pas**.

Ce que ça implique pour cet audit :

- « Mergée ? » n'a pas de réponse git. La question devient : *le contenu de cette branche est-il dans `main` ?*
- Une branche disjointe **ne peut pas être mergée** : un `git merge` créerait un historique à deux racines et un conflit sur presque chaque fichier. Le seul chemin de récupération est le cherry-pick manuel ou la réécriture à la main.
- Le signal retenu ici : **les fichiers du commit de tête de la branche existent-ils dans `main` ?** Comparaison par *basename*, parce que l'arborescence a bougé pendant la réécriture (`app/school/*` → `app/accueil/*`) : une comparaison par chemin aurait produit des faux négatifs en masse.

**Limite assumée de la méthode** : un basename identique ne prouve pas un contenu identique. Le verdict « travail atterri » est fiable au niveau du fichier, pas de la ligne. Avant une suppression de masse, faire un sondage sur 5 branches au hasard.

---

## Tableau par branche

Légende : ✅ MERGÉE (le travail est dans `main`) · 💀 MORTE / OBSOLÈTE · ⏳ TRAVAIL À RÉCUPÉRER · 🔧 EN COURS
Colonne « fic. » : fichiers du commit de tête retrouvés dans `main` / total.

### 🔧 En cours — les 6 branches vivantes (septembre)

| Branche | Lien à main | Date | fic. | Thème | Verdict |
|---|---|---|---|---|---|
| `feat/class-delete-to-archive` | lié | 09-02 | 2/2 | Invariant anti-destruction sur la suppression de classe | 🔧 en cours, à tester |
| `chore/board-cards-class-archive` | lié | 09-02 | 0/1 | Seed 2 cartes board (PR 2 read-only, PR 3 verrou FK) | 🔧 à merger |
| `docs/audit-2026-09-02` | lié | 09-02 | — | Rapport d'audit complet du repo | 🔧 à merger |
| `feat/board-parcours-prof` | lié | 09-02 | 0/1 | Seed 9 cartes « clarifier le parcours prof » | 🔧 à merger |
| `claude/teacher-live-session-nav-hjz3m6` | lié | 09-02 | 0/1 | Seed 6 cartes sur les bugs du mode live | 🔧 **à lire** — produite par une autre session |
| `claude/quick-wins-horaire-4cv7lq` | lié | 08-31 | 3/3 | Sprint horaire (palette, classes archivées, notes) | ✅ **déjà dans `main`** (`b91c7d2`) |

Le `0/1` des branches de seed est normal : leur fichier est une migration neuve, pas encore mergée.

### ✅ Branches de mai reliées à `main` — travail intégré

| Branche | Date | Thème | Verdict |
|---|---|---|---|
| `claude/s1.5-polish-ci-foundation` | 05-16 | ESLint jsx-a11y + skip link + lang fr-BE | ✅ c'est **la racine même de `main`** (`#86`) |
| `claude/s1.5-polish-2c-isolated` | 05-17 | a11y, 29 warnings résolus | ✅ patch équivalent dans `main` (`git cherry` → `-`) |
| `claude/sprint-3-quiz-heatmaps-tuteur` | 05-18 | Heatmap prof niveau concept | ✅ patch équivalent dans `main` |
| `claude/sprint-3-post-session-inbox` | 05-18 | Suggestions de remédiation déterministe | ✅ patch équivalent dans `main` |
| `docs/ai-router-documentation-3465030…` | 05-17 | Doc AI router | ✅ 0 commit d'avance — vide |

### 💀 Les 29 branches `codex/*` — la campagne de composants

Toutes disjointes, toutes du 5 au 12 mai. Elles ont bien livré leur fichier dans `main` (`1/1` pour la quasi-totalité). **Le travail n'est pas perdu — il est simplement inutilisé** : l'audit du 2026-09-02 a relevé que ~24 de ces composants ne sont importés nulle part.

| Branches | fic. | Verdict |
|---|---|---|
| `tab-bar`, `empty-state-component`, `loading-skeleton-component`, `contextual-question-card`, `course-progress-card`, `pdf-page-navigator`, `attendance-row`, `confirm-dialog`, `live-session-timer`, `pairing-code-display`, `question-origin-badge`, `zoom-controls`, `session-recap-hero`, `student-pick-badge`, `unsupported-browser-notice`, `weekly-stats-banner`, `evaluation-buttons`, `student-class-card-component`, `join-class-form-component`, `letter-grade-badge` | 1/1 | 💀 supprimables — fichier livré dans `main` |
| `migrations-vision-foundation` | 2/6 | 💀 supprimable — fondations DB livrées |
| `admin-approval-card`, `listening-indicator`, `mic-permission-modal`, `random-pick-animation` | 0/1 | 💀 supprimables — composants jamais livrés **et** feature abandonnée (voir « Listen ») |
| `add-claude-md`, `auto-status-update`, `claude-md-paire-challengeante`, `docs-update-2026-05-11` | — | 💀 supprimables — docs, contenu dans `CLAUDE.md` de `main` |

**La question n'est pas « pourquoi ces branches traînent »**, mais pourquoi une série de 20+ composants a été produite un par un, mergée, et jamais câblée. Supprimer les branches ne répond pas à ça ; c'est la carte D6 de l'audit code.

### 💀 La famille « Listen / cockpit » — feature explicitement abandonnée

`feat/schoolio-listen-v1`, `feat/listen-mic-permission`, `feat/listen-debug-log`, `fix/permission-recovery`, `feat/poc-cockpit-review-panel`, `feat/poc-cockpit-v2`, `feat/maia-live-poc-ui-component`, `feat/teacher-cockpit-suggestions`, `codex/mic-permission-modal`, `codex/listening-indicator`.

Verdict **💀 supprimables sans hésitation** : la migration `20260513150200_drop_admin_board_and_listen.sql`, présente dans `main`, a explicitement supprimé la feature. Les restes (`hooks/useMicCapture.ts`, `hooks/useMicPermission.ts`, `components/permissions/MicPermissionRecoveryModal.tsx`) sont le code mort déjà relevé par l'audit.

### 💀 La famille « robustesse du générateur » — travail reporté, pas perdu

`fix/resilient-json-parse`, `fix/resilient-parse-v8`, `fix/serialize-postgrest-errors`, `fix/internal-timeout-4-workers`, `feat/partition-pdf-by-worker`, `fix/generator-reduce-concurrency-instrument`, `feat/migrate-trigger-dev`, `fix/trigger-ws-polyfill`, `fix/trigger-ws-polyfill-all-clients`, `chore/bump-trigger-duration`, `fix/wire-trigger-and-route-to-extract-content`, `feat/refactor-chapters-first`.

Ces branches affichent `0/1` parce qu'elles modifient toutes **`lib/generate-questions/runner.ts`**, un fichier qui **n'existe plus** : le pipeline a été refactoré en `orchestrator.ts` + `run-text-pipeline.ts` + `run-image-pipeline.ts`.

**J'ai vérifié que les comportements ont survécu au refactor**, plutôt que de conclure du nom de fichier :

| Garde-fou d'origine | État dans `main` |
|---|---|
| Parse JSON résilient (fence + greedy + catch) | ✅ 12 occurrences dans `run-text-pipeline.ts`, 9 dans `image-questions.ts` |
| Deadline / timeout interne | ✅ 4 occurrences dans `run-text-pipeline.ts` |
| Pool de concurrence par workers | ✅ `run-text-pipeline.ts:406-429` |

Verdict **💀 supprimables** : le travail a été reporté dans la nouvelle architecture.

### 💀 Extraction PDF, AI router, divers mai — travail atterri

`fix/pdf-extraction-serverless`, `fix/use-pdf-parse`, `fix/pdfjs-disable-worker`, `chore/remove-pdf-parse-dep`, `feat/extract-chapters-haiku`, `feat/extract-content-pipeline`, `feat/pipeline-text-only`, `feat/anthropic-haiku-provider`, `feat/anthropic-prompt-caching`, `feat/ai-router-model-override`, `feat/pdf-batch-rate-limiter`, `feat/migration-syllabus-extraction`, `fix/select-use-count-nonexistent`, `fix/question-form-and-badge`, `fix/upload-tags-and-question-filters`, `feat/quiz-grading-server-side`, `feat/student-dashboard-subjects-assignments`, `feat/student-dashboard-v0`, `feat/document-extractor-m0`, `feat/comparateur-shell`, `feat/beta-feedback-*` (4), `feat/mission-control-backend`, `feat/mc-update-api`, `jules/db-period-check-…`, `ux/multi-select-type-filter`, `ux/sidebar-and-form-cleanup`, `chore/ui-copy-chapter-aware`, `chore/ui-label-questions-inserted`, `feat/wow-effects`, `claude/elastic-heisenberg-d08bdd`, `claude/sprint-1b-rgpd-extended`, `feat/design-unification-maia-light`, `fix/maia-ingestion-sonnet-4-5-prefill`.

Toutes disjointes, fichiers de tête présents dans `main`. **💀 supprimables.**

### 💀 Branches d'audit et de documentation

`audit-2026-05-10-pr1-quick-wins`, `audit-2026-05-10-pr2-db-hardening`, `audit-2026-05-10-pr3-auth-rgpd`, `audit-2026-05-12-pr0-foundations`, `audit-2026-05-12-pr-hotfix-claudy-criticals`, `docs/roadmap-and-architecture`, `docs/roadmap-html`, `docs/pdf-extraction-design`, `docs/investigation-waitUntil-2026-05-14`, `docs/demo-runbook-adrien`, `feat/pdf-images-spec`, `feat/research-lms-market-…`, `chore/session-recap-2026-05-14`, `chore/session-recap-2026-05-14-v2`.

**💀 supprimables** — contenu présent dans `docs/` de `main`.

### 💀 POC VISX — rejeté puis nettoyé

`claude/poc-visx-heatmap-prof` (05-15) puis `claude/cleanup-visx-poc` (05-16, « remove VISX POC + deps after design eval rejection »). Le cycle est complet et documenté. **💀 supprimables.**

---

## Section spéciale — Pipeline B

**9 branches** : `feat/pipeline-b-pr1-hardening` → `pr8-activation`, plus `debug/pipeline-b-flag-sentinel`.

### État réel : complet et mergé, pas abandonné

Tout le code est dans `main`, vérifié fichier par fichier :

| Fichier | Dans `main` |
|---|---|
| `lib/generate-questions/run-image-pipeline.ts` | ✅ |
| `lib/generate-questions/vision-classify.ts` | ✅ |
| `lib/generate-questions/image-questions.ts` | ✅ |
| `lib/pdf/image-types.ts` | ✅ |
| `lib/feature-flags.ts` | ✅ |
| `lib/pdf/subject-affinity.ts` (les 4 fixes anti-hallucination) | ✅ identique à la branche sentinel |

`feat/pipeline-b-pr8-activation` affiche `0/1` : son commit de tête **supprime** `GenerationProgress.tsx` (231 lignes retirées). Ce n'est pas du travail perdu, c'est une suppression.

### Pourquoi le flag reste OFF — la réponse est écrite dans `main`

`docs/superpowers/deploy-runbooks/2026-05-15-pipeline-b-activation.md` :

> « Le code pipeline B est **présent en prod mais inactif** (feature flag `PIPELINE_B_ENABLED` OFF par défaut). »

Le runbook décrit ensuite l'étape qui n'a jamais été franchie : activer le flag **en preview Vercel uniquement**, puis passer 5 syllabi de QA (chimie 5e, histoire 6e, géo 4e, bio 5e, maths 6e) avec des attentes chiffrées, et mesurer quatre requêtes SQL (taux de succès des jobs, activité pipeline B, distribution de `needs_review`, couverture de la classification Vision).

**Le pipeline B n'est donc ni abandonné ni inachevé : il est en attente d'une session de QA de quelques heures.**

### Recommandation : **activer, en suivant le runbook — mais pas avant deux correctifs**

Deux findings de l'audit code touchent directement ce que le pipeline B produit, et les activer sans les corriger dégraderait l'expérience prof :

1. **`GeoMap` masque l'image que le prof doit valider** et pointe vers `/topojson/*.json`, un dossier **qui n'existe pas dans `public/`**. Le pipeline B est précisément celui qui génère les questions de type carte. Activer avant ce correctif, c'est produire du contenu que le prof ne peut pas juger.
2. **Le prof ne valide pas ce que l'élève verra** : `start-quiz` ne sert ni `formula_mathml`, ni `molecule_smiles`, ni `geo_topojson_path`. Le pipeline B est la seule source de ces questions.

Les 9 branches elles-mêmes sont **💀 supprimables** : leur contenu est intégralement dans `main`. Ce qui doit survivre, c'est le runbook — il y est déjà.

---

## Recommandation finale

### Combien supprimer sans rien perdre

**115 branches sur 121** peuvent être supprimées sans perte de code : 110 disjointes dont le contenu est dans `main` ou obsolète, plus les 5 branches de mai reliées dont le travail est intégré.

**Mais pas avant d'avoir posé une ancre d'historique.** L'historique d'avant le 17 mai — jusqu'à 347 commits, remontant au 4 mai — n'existe **que** dans ces branches. `main` ne le contient pas et ne le contiendra jamais. Supprimer les 110 disjointes efface définitivement les six premières semaines du projet : le pivot HistoGuess → Schoolio → Maïa, les décisions de refonte, les raisons derrière la moitié de la dette que l'audit code a listée.

**Avant toute suppression, poser un tag sur la branche la plus profonde**, par exemple :

```
git tag archive/pre-rewrite-2026-05-17 origin/fix/generator-reduce-concurrency-instrument
git push origin archive/pre-rewrite-2026-05-17
```

347 commits, jusqu'au `Initial commit from Create Next App`. Un tag ne coûte rien, ne pollue pas la liste des branches, et rend la suppression réversible en lecture.

### Les 5 branches qui méritent vraiment attention

Aucune des 110 branches de mai ne contient de travail à récupérer — c'est le résultat central de cet audit, et il est rassurant. Les branches qui demandent une décision sont toutes récentes :

| # | Branche | Pourquoi |
|---|---|---|
| 1 | `claude/teacher-live-session-nav-hjz3m6` | Produite aujourd'hui par une **autre session**, contient 6 cartes board sur des bugs du mode live que personne n'a lues. À ouvrir en premier : c'est le seul contenu de ce dépôt dont j'ignore la teneur. |
| 2 | `feat/class-delete-to-archive` | L'invariant anti-destruction. À tester puis merger — c'est le correctif du risque n°1. |
| 3 | `chore/board-cards-class-archive` | Porte la carte PR 3 (verrou FK + `DROP POLICY`), le seul correctif qui ferme réellement le risque n°1. |
| 4 | `docs/audit-2026-09-02` | Le rapport d'audit code. Invisible depuis `main` tant qu'il n'est pas mergé. |
| 5 | `feat/board-parcours-prof` | Les 9 cartes du parcours prof, dont le double-gate de validation qui bloque le beta-testeur. |

### Ordre suggéré

1. Poser le tag d'archive.
2. Lire `claude/teacher-live-session-nav-hjz3m6`.
3. Tester puis merger les 4 branches de septembre restantes.
4. Décider du pipeline B : QA selon le runbook, après les deux correctifs GeoMap / rendu élève.
5. Supprimer les 115 autres — en un seul passage, une fois le tag poussé et vérifié.

---

*Audit read-only. Aucune branche supprimée, aucun push, aucune modification de code hors ce fichier.*
