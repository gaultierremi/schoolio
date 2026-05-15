# Maïa — Inventaire des pages & workflow utilisateur (v2)

> **Version 2** — basée sur un audit composant-par-composant (60+ fichiers lus le 2026-05-15) et l'intégration de tous les arbitrages produit. Remplace intégralement la v1.

## Changelog v2

- Audit fidèle au repo `gaultierremi/maia` (branch main, 283 commits sur 30j)
- **Live Kahoot reclassifié** : `🔮 post-MVP` → `✅ fonctionnel` (déjà câblé avec Supabase realtime)
- **Heatmap prof devoir reclassifiée** : `✅ partiel` → `🔴 manquant` (mockup HTML existe, composant final non buildé)
- **Curation** : actuellement questions seulement (`QuestionForm`), extension théorie+misconceptions+hints à faire en modale d'expansion
- Section "composants orphelins exploitables" ajoutée (17 UI primitives + 8 composants élève + 1 wizard prêts mais non câblés)
- Section "legacy à retirer" ajoutée (Schoolio branding, gamification avancée, anciens dashboards)
- Tous les arbitrages produit Alex intégrés (URL flat `/accueil`, double-auth SSO+PIN, manifeste landing, ton adulte, Lucide-only, 3 écoles pilotes)

---

## Légende

| Symbole | Signification |
|---|---|
| ✅ | Page implémentée et fonctionnelle |
| 🟡 | Page squelette (importe layout mais peu de contenu) |
| 🔴 | Page manquante (à créer) |
| ❌ | Page legacy à retirer ou rerouter |
| 🚨 | Bloquant MVP (sans elle, parcours cassé) |
| ⭐ | MVP nice-to-have |
| 🔮 | Post-MVP (v1.1+) |
| 🧩 | Effort réduit grâce à un composant orphelin déjà prêt |

---

## 1. Architecture globale (verrouillée)

- **Routing flat** : `maia.app/accueil` rôle-aware via `app_metadata.role`. PAS de sous-domaine par école.
- **Branding école** : in-app uniquement (header/sidebar). URL identique pour toutes les écoles.
- **Login** : `maia.app/login` avec 3 boutons SSO (Google, Microsoft, SmartSchool dès dispo). Pas de sélecteur "choisis ton école".
- **Re-auth quotidienne** : PIN 4 chars bcrypt server-side, fallback SSO après 3 échecs, reset via "PIN oublié" → re-SSO. Re-demande **prochain matin** seulement.
- **Multi-tenant** : `app_metadata.school_id` + RLS Supabase. Cloisonnement sécurité 100% côté DB.
- **Compte founder** : transient, ne survit pas au GTM.
- **`/student/*` et `/school/*`** : hard rename vers `/accueil` (role-aware), pas de redirect legacy.
- **Tone copy** : adulte bienveillant, "Bonjour" pas "Salut".
- **Icônes** : Lucide partout, emojis uniquement dans les messages du tuteur Maïa.

---

## 2. Public (non-authentifié)

| Route | Statut | Priorité | Description / Composants |
|---|---|---|---|
| `/` | ✅ | 🚨 | Landing manifeste — utilise `LandingCTA` + sections custom. ⚠️ Header.tsx contient encore logo "Schoolio" → rebrand pending |
| `/login` | ✅ | 🚨 | SSO Google + Microsoft (SmartSchool 🔮 à ajouter) |
| `/auth/callback` | ✅ | 🚨 | Callback OAuth |
| `/auth/error` | 🔴 | 🚨 | Erreur OAuth (token expiré, refus consentement) |
| `/legal/cgu` | 🔴 | 🚨 | CGU |
| `/legal/mentions-legales` | 🔴 | 🚨 | Mentions légales (BE) |
| `/legal/confidentialite` | 🔴 | 🚨 | Politique confidentialité RGPD |
| `/legal/cookies` | 🔴 | ⭐ | Politique cookies + bannière consentement |
| `/pilotes` | 🔴 | 🚨 | Section "3 écoles pilotes, 1 an gratuit, accompagnement" (copy variante C validée). Anciennement appelée `/demo` |
| `/404` | 🔴 | 🚨 | Not found brandée Maïa |
| `/500` | 🔴 | ⭐ | Erreur serveur brandée |
| `/maintenance` | 🔴 | 🔮 | Mode maintenance |
| `/mockups` | ✅ | 🔮 | Index des mockups HTML (utilité interne dev, à protéger en prod) |

**❌ À retirer / rerouter** : aucune route publique legacy.

---

## 3. Auth & Onboarding

| Route | Statut | Priorité | Description |
|---|---|---|---|
| `/onboarding/name` | 🟡 | 🚨 | Wrapper Suspense, délègue à `OnboardingNameClient` (non-audité en détail) |
| `/onboarding/teaching-levels` | 🟡 | 🚨 | Idem pour `OnboardingTeachingLevelsClient` (prof uniquement) |
| `/onboarding/role-select` | 🔴 | 🚨 | Choix prof/élève si non déterminé par invitation. ⚠️ Probablement à éviter si tout passe par invitation école → confirmer avec Alex |
| `/onboarding/consent-rgpd` | 🔴 | 🚨 | Consent RGPD obligatoire avant 1er pilote |
| `/onboarding/pin-setup` | 🔴 | 🚨 | **Nouvelle page** : saisie PIN 4 chars après 1er SSO (bcrypt server-side) |
| `/onboarding/join-class` | 🔴 | 🚨 | Élève : saisie code 6 chars OU affichage classes déjà rejointes |
| `/auth/pin-unlock` | 🔴 | 🚨 | **Re-auth quotidienne** : saisie PIN, 3 essais, fallback SSO |
| `/join/[token]` | ✅ | 🚨 | Lien d'invitation classe |
| `/join` (saisie code manuel) | 🟡 | ⭐ | Saisie code 6 chars |

---

## 4. Accueil élève (`/accueil` rôle-élève, ex-`/student`)

### 4.1 Pages

| Route cible | Statut actuel (sous `/student`) | Composants assemblés | Effort |
|---|---|---|---|
| `/accueil` | ✅ `/student` | `HeatmapDashboardClient` (orchestrateur central) + `ConceptHeatmapGrid` + `SubjectClassPicker` + `WeeklyEffort` | Rename direct + revue copy (ton adulte) |
| `/accueil/devoirs` | ✅ `/student/assignments` | `AssignmentCard` | Rename + ajout icône `Mail` Lucide à côté du H1 d'accueil |
| `/accueil/devoirs/[id]` | ✅ `/student/assignments/[id]` | Inline (briefing + boutons) | Rename + intégrer `SessionRecapHero` 🧩 si déjà complété |
| `/accueil/devoirs/[id]/quiz` | ✅ `/student/assignments/[id]/quiz` | `MCQOptions` + `NumericInput` + `ShortTextInput` + `CorrectionPanel` + `TutorPanel` | Rename + câbler `EvaluationButtons` 🧩 (👍/👎 indice) |
| `/accueil/devoirs/[id]/bilan` | 🔴 | 🧩 `SessionRecapHero` (orphelin prêt) + delta heatmap | 🚨 — page de bilan post-quiz manquante |
| `/accueil/cours/[id]` | 🔴 | 🧩 `CourseList` + `CourseProgressCard` (orphelins prêts) | ⭐ — drill-down concept depuis heatmap |
| `/accueil/concepts/[id]` | 🔴 | À builder | ⭐ — théorie curée + exos ciblés (révision libre) |
| `/accueil/plan-maia` | 🔴 | 🧩 `StudyWizard` (orphelin) à adapter | 🚨 — déclencher un plan du jour 20 min multi-matière |
| `/accueil/live/[code]` | ✅ `/student/live/[code]` | Inline realtime Supabase | Rename + polish avec orphelins (`StudentPickBadge`, `LiveSessionTimer`, `AttendanceRow`) 🧩 |
| `/accueil/historique` | 🔴 | À builder | ⭐ — sessions passées |
| `/accueil/notifications` | 🔴 | À builder | ⭐ — in-app notifs (nouveau devoir, classe, live en cours) |

### 4.2 Composants orphelins exploitables côté élève

| Composant | Fonction | Où l'assembler |
|---|---|---|
| 🧩 `StreakHeroCard` | Greeting + streak badge | Header de `/accueil` (alternative à l'actuel embed) |
| 🧩 `WeeklyStatsBanner` | 4 KPI semaine (devoirs, questions, note, trophée) | `/accueil` section stats |
| 🧩 `TodaySchedule` | Horaire du jour avec créneaux + prof | `/accueil` sidebar ou section |
| 🧩 `ExplorerFooter` | Nav 3 col (Entraînement / Révision / Stats) | Footer `/accueil` mobile |
| 🧩 `AssignmentList` | Liste devoirs 2 sections (À faire / Récents) | Alternative à `AssignmentCard` brute |
| 🧩 `CourseList` | Grille cours PDF | `/accueil/cours` |
| 🧩 `AIChallengeBanner` | Bannière "Défi Maïa" | ❌ probablement à retirer (label "IA" prohibé, voir mémoire `feedback_no_ia_label_in_ux`) |
| 🧩 `StudentWelcomeOnboarding` | Onboarding 3 étapes | ❌ legacy, remplacé par `/onboarding/name` |
| 🧩 `DashboardHeader` (student) | Header "Bonjour" + signout | Variante simple — actuellement embed dans HeatmapDashboardClient |

### 4.3 Parcours élève (workflow)

```
[Élève tape maia.app]
  ├─ Non auth → / (landing)
  └─ Auth → /accueil
              │
              ├─ Prochain matin ? → /auth/pin-unlock (PIN ou fallback SSO)
              ↓
        /accueil (heatmap multi-matière via SubjectClassPicker)
              │
              ├─ Bonjour Mathéo + icône Mail Lucide → /accueil/devoirs
              ├─ "Plan Maïa du jour" → /accueil/plan-maia (20 min mix langue/science)
              ├─ Clic concept faible → /accueil/concepts/[id] (théorie + exos)
              ├─ Badge rouge "Live en cours" → /accueil/live/[code]
              └─ Avatar top-right → modal "Mon compte" (infos + classes + logout)
              ↓
        Quiz devoir → feedback Maïa instantané (TutorPanel + CorrectionPanel)
              ↓
        /accueil/devoirs/[id]/bilan (delta mastery + XP + reco)
              ↓
        Retour /accueil (heatmap update)
```

---

## 5. Accueil prof (`/accueil` rôle-prof, ex-`/school`)

### 5.1 Pages déjà implémentées (à renommer)

| Route cible | Statut actuel (sous `/school`) | Composants | Note |
|---|---|---|---|
| `/accueil` | ✅ `/school` | `DashboardHeader` + `ToHandleSection` + `KpiGrid` + `ClassesPreview` + `QuickActions` + `ActivityTimeline` + `CurrentClassBanner` + `WelcomeScheduleOnboarding` | Rename + revue copy (ton adulte) |
| `/accueil/classes` | ✅ `/school/classes` | Inline | Rename |
| `/accueil/classes/nouvelle` | ✅ `/school/classes/new` | Inline form | Rename + intégrer `PairingCodeDisplay` 🧩 |
| `/accueil/classes/[id]` | ✅ `/school/classes/[id]` | Inline (membres + assignments + invite QR) | Rename |
| `/accueil/classes/[id]/invitation` | ✅ `/school/classes/[id]/invite` | Inline | Rename + utiliser `PairingCodeDisplay` 🧩 |
| `/accueil/classes/[id]/devoirs/nouveau` | ✅ `/school/classes/[id]/assignments/new` | Inline | Rename |
| `/accueil/classes/[id]/devoirs/[id]` | 🟡 `/school/classes/[id]/assignments/[id]` | Inline (pas de heatmap) | 🔴 **Heatmap classe à builder** (cf §5.3) |
| `/accueil/cours` | ✅ `/school/courses` | Inline + `TabBar` | Rename |
| `/accueil/cours/[id]` | ✅ `/school/courses/[id]` | Inline | Rename |
| `/accueil/cours/[id]/exercices` | ✅ `/school/courses/[id]/exercises` | `PageRangeGenerator` + `MarkdownLatex` | Rename |
| `/accueil/cours/[id]/exercices/[id]` | ✅ `/school/courses/[id]/exercises/[id]` | Inline + `MarkdownLatex` | Rename |
| `/accueil/curation` | ✅ `/school/questions` | `useQuestionsPage` hook + `FilterBar` + `QuestionForm` + `SubjectLevelSelector` + `PdfUploadZone` + `DraftCard` + `PendingCard` + `ValidatedCard` + `RejectedCard` + `TypeBadge` + `SubjectSidebar` + `DifficultyStarsEditor` | Rename `/questions` → `/curation` + **étendre modale** (cf §5.3) |
| `/accueil/import` | ✅ `/school/import` | `GenerationProgress` | Rename |
| `/accueil/horaire` | ✅ `/school/schedule` | `ScheduleGrid` + `SlotModal` + `ClassHoursSummary` | Rename |
| `/accueil/live` (lobby) | 🔴 | À builder | Liste sessions live actives |
| `/accueil/live/[id]` | ✅ `/school/live/[id]` | Inline realtime (phases lobby→answering→revealed→picked→ended) | Rename + polish avec `StudentPickBadge` 🧩 + `LiveSessionTimer` 🧩 + `AttendanceRow` 🧩 + `EvaluationButtons` 🧩 |
| `/accueil/session/nouvelle` | ✅ `/school/session/new` | Inline (sélection questions + start) | Rename |
| `/accueil/organisation` | 🟡 `/school/organization` | Stub | ⭐ tags org (optionnel) |
| `/accueil/ingestion/[jobId]` | 🟡 `/school/ingestion/[jobId]` | Stub | Polling progress |

### 5.2 Pages à créer côté prof

| Route | Priorité | Description | Effort |
|---|---|---|---|
| `/accueil/classes/[id]/devoirs/[id]/heatmap` | 🚨 | **Heatmap classe** (25 élèves × 8 concepts, suggestions remédiation, KPI). Mockup `dashboard-prof-heatmap-mockup.html` existe — à transposer en React | 2-3 jours |
| `/accueil/classes/[id]/devoirs/[id]/eleve/[id]` | 🚨 | Drill-down élève depuis cellule heatmap (réponses détaillées) | 1 jour |
| `/accueil/curation/concepts/[id]` | 🚨 | **Modale d'expansion concept** : éditer théorie + misconceptions + hints + explanations + source — actuellement `QuestionForm` ne couvre que les questions | 3-4 jours |
| `/accueil/curation/chapitre/[id]/valider-tout` | 🚨 | Action batch "valider tout le chapitre" depuis la vue questions | 0.5 jour |
| `/accueil/improvements` | 🚨 | **Hub boucle post-session** — suggestions Maïa hebdo (réponses non-matchées agrégées) | 2-3 jours |
| `/accueil/improvements/[id]` | 🚨 | Détail proposition Maïa (élève, contexte, réponse, suggestion) | 1 jour |
| `/accueil/eleves` | ⭐ | Vue transverse tous élèves du prof | 1-2 jours |
| `/accueil/eleves/[id]` | ⭐ | Fiche élève transverse (mastery, sessions, devoirs) | 1-2 jours |
| `/accueil/devoirs` | ⭐ | Vue transverse devoirs toutes classes | 1 jour |
| `/accueil/bibliotheque` | ⭐ | Browse curriculum FW-B (CESS G) | 1-2 jours |
| `/accueil/notifications` | ⭐ | In-app notifs (ingestion ready, improvements hebdo, élève bloqué) | 1 jour |

### 5.3 Surprises à corriger

**Le `QuestionForm` actuel ne couvre QUE les questions** (énoncé + options + explication). La spec MVP §6 S2 prévoit "review concept par concept, valider/éditer/rejeter théorie + questions + misconceptions + indices". Alex a tranché : **modale d'expansion par question** qui ouvre l'édition complète (théorie + misconceptions + hints + explanations + source_quote). C'est l'**extension principale** du hub curation à livrer.

**Le slider d'activation question (activée/désactivée globalement)** est demandé dans la modale.

**La heatmap classe est totalement à construire**. Mockup HTML existe. Composant React absent.

---

## 6. Admin (founder, transient pré-GTM)

| Route | Statut | Description |
|---|---|---|
| `/admin/board` | ✅ | Kanban dev board (KanbanCard + CardModal) — fonctionnel |
| `/admin/ai-router` | ✅ | Dashboard quotas + cache IA |
| `/admin/founders` | 🟡 | Gestion comptes founder — stub |

**Décision** : compte founder = black box temporaire, **aucun investissement archi**, sera retiré au GTM final.

---

## 7. RGPD + Settings + Légal (bloquant pré-pilote école)

| Route | Statut | Priorité | Note |
|---|---|---|---|
| `/legal/confidentialite` | 🔴 | 🚨 | Politique RGPD — bloquant tout pilote école |
| `/legal/cgu` | 🔴 | 🚨 | CGU |
| `/legal/mentions-legales` | 🔴 | 🚨 | Mentions légales BE |
| `/legal/cookies` | 🔴 | ⭐ | Politique cookies + bannière |
| `/onboarding/consent-rgpd` | 🔴 | 🚨 | Consent flow obligatoire (Art. 7 RGPD) |
| `/parametres` | 🔴 | 🚨 | Hub paramètres |
| `/parametres/compte` | 🔴 | 🚨 | Infos compte + liste classes + école (cf mémoire `feedback_no_student_profile_route` — pas de `/profile` distinct, ici ça remplace) |
| `/parametres/confidentialite` | 🔴 | 🚨 | Consentements détaillés révocables |
| `/parametres/export-donnees` | 🔴 | 🚨 | Droit à la portabilité RGPD (Art. 20) — JSON export |
| `/parametres/suppression-compte` | 🔴 | 🚨 | Droit à l'oubli RGPD (Art. 17). **⚠️ Règle interne #23 CLAUDE.md** : tables événementielles (`assignment_completions`, `class_memberships`, etc.) → **anonymisation**, pas DELETE |
| `/parametres/notifications` | 🔴 | ⭐ | Préférences in-app + email |
| `/parametres/securite` | 🔴 | ⭐ | Changer PIN + audit log connexions |
| `/parametres/langue` | 🔴 | 🔮 | FR uniquement MVP, structure i18n prête |

**Audit RGPD à logger** dans `audit_log` :
- Connexion SSO (provider, IP, timestamp)
- Tentative PIN (success/fail) dans `pin_attempts`
- Export de données demandé
- Suppression de compte demandée
- Modification du PIN
- Modification du consent

---

## 8. Erreurs & Edge cases

| Route | Statut | Priorité |
|---|---|---|
| `/404` | 🔴 | 🚨 |
| `/403` | 🔴 | 🚨 (cross-tenant blocked) |
| `/401` | 🔴 | ⭐ (session expirée) |
| `/500` | 🔴 | ⭐ |
| `/classe-archivee` | 🔴 | ⭐ (mémoire `project_class_access_window`) |
| `/session-expiree` | 🔴 | ⭐ |
| `/ecole-suspendue` | 🔴 | 🔮 |

---

## 9. Composants orphelins à exploiter (asset stratégique)

17 primitives UI + 8 composants élève + 1 wizard sont **prêts mais non câblés**. C'est de l'effort déjà fourni à capitaliser.

### 9.1 Live Kahoot — orphelins à câbler

- 🧩 `StudentPickBadge` — Badge tirage au sort avec animation pulsing
- 🧩 `LiveSessionTimer` — Compte à rebours gris→amber→orange→rouge (20s phase silencieuse)
- 🧩 `AttendanceRow` — Présence élève (✓/✗/⏰)
- 🧩 `EvaluationButtons` — Boutons tuteur ✓/◐/✗/?

**Action** : `/accueil/live/[id]` (prof) et `/accueil/live/[code]` (élève) ont déjà la logique realtime inline → remplacer le rendering brut par ces 4 composants pour la mécanique exacte décrite en mémoire `project_live_session_kahoot_year`.

### 9.2 Bilan post-session

- 🧩 `SessionRecapHero` — Bilan (durée, présence, pages couvertes)

**Action** : nouvelle page `/accueil/devoirs/[id]/bilan` qui assemble ce composant + delta heatmap.

### 9.3 Invitation classe

- 🧩 `PairingCodeDisplay` — Code 6 chars + QR + countdown expiration

**Action** : intégrer dans `/accueil/classes/[id]/invitation` (actuellement code inline).

### 9.4 Primitives UX manquantes activement

- 🧩 `ConfirmDialog` — Modales destructives (suppression, archivage). À utiliser partout où une action irréversible existe.
- 🧩 `EmptyState` — "Aucun devoir", "Pas de classe", etc. À utiliser dans toutes les pages avec listes potentiellement vides.
- 🧩 `LoadingSkeleton` — Skeleton loaders. À utiliser pendant les fetches API au lieu de spinners.
- 🧩 `ZoomControls` — Zoom PDF/viewport pour les cours.
- 🧩 `PdfPageNavigator` — Navigation PDF compact/comfortable.
- 🧩 `UnsupportedBrowserNotice` — Bannière navigateur non supporté.
- 🧩 `MasteryProgressBar` — Barre gradient (rouge<30%, orange<60%, vert≥60%) avec delta. Idéal pour la heatmap prof.

### 9.5 Plan Maïa

- 🧩 `StudyWizard` — Wizard 4 étapes (subject → source → config → preview). À adapter pour le plan Maïa du jour 20 min multi-matière.

---

## 10. Legacy à retirer

| Élément | Raison | Action |
|---|---|---|
| `Header.tsx` logo "Schoolio" | Rebrand Maïa pending | Changer le logo + nom |
| `Avatar.tsx` skins gamification (laurel, helmet, samurai, Bronze/Silver/Gold/Diamond) | Mémoire `feedback_no_pricing_public` + spec §2.2 (pas de gamification avancée MVP) | Simplifier en avatar = photo SSO ou icône Lucide `UserCircle` |
| `UserProfileCard.tsx` stats `games/streak/rank/best_score/favorite_mode` | Gamification legacy | Supprimer ou refactor |
| `QuizCard.tsx` + `ReviewCard.tsx` (legacy) | Remplacés par les composants quiz côté assignment | Vérifier qu'ils ne sont vraiment plus utilisés, sinon supprimer |
| `StudentWelcomeOnboarding.tsx` (3 étapes 🎒🔁🏫 avec emojis) | Mémoire `feedback_lucide_icons_except_tutor` + `feedback_landing_tone_adult_kind` | Remplacer par `/onboarding/name` propre |
| `AIChallengeBanner.tsx` | Mémoire `feedback_no_ia_label_in_ux` (jamais "IA" user-facing) | Supprimer ou renommer "Défi Maïa" |
| `AuthButton.tsx` | Sign in Google avec branding Schoolio | Refactor pour SSO triple (Google + M365 + SmartSchool) |
| Routes `/student/*` et `/school/*` | Décision Alex : hard rename direct | Renommer tous les dossiers vers `/accueil` rôle-aware |
| `/school/syllabus` et `/school/syllabus/upload` | Remplacés par `/school/import` | Supprimer routes obsolètes |

---

## 11. Plan d'implémentation sprint-by-sprint

Effort estimé en jours-dev. Hypothèse rythme actuel : ~10 commits/jour, ~1-2 PRs/jour.

### Sprint 0 — Renommages & rebrand (3-4 j)

🚨 **Bloquant tout le reste** car change l'URL de toutes les pages.

- [ ] Renommer `/student/*` → `/accueil/*` (role-aware élève) — hard rename
- [ ] Renommer `/school/*` → `/accueil/*` (role-aware prof)
- [ ] Routing flat `maia.app` (suppression de toute logique sous-domaine si présente)
- [ ] Rebrand `Header.tsx` Schoolio → Maïa (logo, nom, copy)
- [ ] Simplifier `Avatar.tsx` (retirer skins gamification, fallback photo SSO + Lucide)
- [ ] Retirer `AuthButton.tsx` legacy, créer login avec 3 SSO (Google + M365 + SmartSchool stub)
- [ ] Supprimer `/school/syllabus*` routes obsolètes
- [ ] Supprimer ou refactor `QuizCard`, `ReviewCard`, `UserProfileCard`, `AIChallengeBanner`, `StudentWelcomeOnboarding`
- [ ] Pass copy `/accueil` élève + prof : ton adulte, "Bonjour" pas "Salut", Lucide partout

### Sprint 1 — Auth & RGPD (4-5 j)

🚨 **Bloquant tout pilote externe.**

- [ ] `/onboarding/consent-rgpd` (Art. 7 RGPD)
- [ ] `/onboarding/pin-setup` (PIN 4 chars bcrypt server-side, table `user_pin` + RLS)
- [ ] `/auth/pin-unlock` (re-auth quotidienne, 3 essais, fallback SSO)
- [ ] `/auth/error` (token expiré, refus consentement)
- [ ] Table `pin_attempts` + audit log
- [ ] `/legal/confidentialite`, `/legal/cgu`, `/legal/mentions-legales` (copy juridique)
- [ ] `/legal/cookies` + bannière consent (minimum si analytics)
- [ ] `/parametres/compte`, `/parametres/confidentialite`, `/parametres/export-donnees`, `/parametres/suppression-compte` (avec anonymisation respectant règle interne #23)

### Sprint 2 — Curation étendue (4-5 j)

🚨 **Cœur produit prof.**

- [ ] Étendre `QuestionForm` en modale d'expansion : théorie + misconceptions + hints + explanations + source_quote
- [ ] Slider activation question (active/inactive globalement) dans la modale
- [ ] Action batch "valider tout le chapitre" depuis la vue questions
- [ ] Rebaptiser route `/school/questions` → `/accueil/curation`

### Sprint 3 — Heatmap classe prof (3-4 j)

🚨 **Pièce manquante centrale du dashboard prof.**

- [ ] `/accueil/classes/[id]/devoirs/[id]/heatmap` (composant React depuis mockup HTML)
- [ ] Drill-down `/accueil/classes/[id]/devoirs/[id]/eleve/[id]` (réponses détaillées élève)
- [ ] Intégrer `MasteryProgressBar` 🧩 pour les KPI

### Sprint 4 — Boucle post-session (3-4 j)

🚨 **Différenciateur produit (spec §6 S6).**

- [ ] Capture `unmatched_answers` côté quiz API (si pas déjà fait)
- [ ] Agrégation hebdo Trigger.dev / Inngest → `improvement_suggestions` table
- [ ] `/accueil/improvements` (hub propositions hebdo)
- [ ] `/accueil/improvements/[id]` (détail + valider/rejeter par batch)

### Sprint 5 — Polish Live Kahoot + Plan Maïa élève (3-4 j)

⭐ **Live déjà fonctionnel, juste le polish UI.**

- [ ] Câbler `StudentPickBadge` 🧩 + `LiveSessionTimer` 🧩 + `AttendanceRow` 🧩 + `EvaluationButtons` 🧩 dans `/accueil/live/[id]` (prof)
- [ ] Idem côté élève `/accueil/live/[code]`
- [ ] Badge rouge "Live en cours" sur `/accueil` élève quand prof lance pour sa classe
- [ ] `/accueil/plan-maia` (adaptation de `StudyWizard` 🧩 pour plan 20 min multi-matière)
- [ ] `/accueil/devoirs/[id]/bilan` (intègre `SessionRecapHero` 🧩 + delta heatmap)

### Sprint 6 — Pages élève complémentaires (2-3 j)

⭐ **Drill-down depuis heatmap.**

- [ ] `/accueil/concepts/[id]` (théorie curée + exos ciblés en révision libre)
- [ ] `/accueil/cours/[id]` (intègre `CourseList` 🧩 + `CourseProgressCard` 🧩)
- [ ] `/accueil/historique` (sessions passées)
- [ ] User-menu dropdown top-right (modal "Mon compte" avec infos + classes + logout — pas de page profil dédiée per mémoire)

### Sprint 7 — Errors, Empty States, Loading (1-2 j)

⭐ **Polish défensif.**

- [ ] `/404`, `/403`, `/401`, `/500` brandées
- [ ] `/classe-archivee`, `/session-expiree`
- [ ] Câbler `EmptyState` 🧩 partout où des listes peuvent être vides
- [ ] Câbler `LoadingSkeleton` 🧩 partout où des spinners actuels
- [ ] Câbler `ConfirmDialog` 🧩 sur toutes les actions destructives (archive, delete, anonymize)

### Sprint 8 — Landing manifeste + pilotes (1-2 j)

🚨 **Capture des écoles pilotes.**

- [ ] Section `/pilotes` dans la landing (copy variante C validée — manifeste pédagogique, 3 écoles, 1 an gratuit, accompagnement, pas de co-construction, `pilotes@maia.app`)
- [ ] Refonte hero avec ton manifeste (pas commercial)
- [ ] Section RGPD/sécurité visible (argument compliance pour DPO école)
- [ ] CTA unique : mailto `pilotes@maia.app`

### Sprint 9 — Nice-to-have & post-MVP (variable)

🔮

- [ ] `/accueil/eleves` + `/accueil/eleves/[id]` (vue transverse prof)
- [ ] `/accueil/bibliotheque` (browse curriculum FW-B)
- [ ] `/accueil/notifications` (in-app)
- [ ] `/parametres/notifications`, `/parametres/securite`, `/parametres/langue`
- [ ] SmartSchool SSO (3ème provider)
- [ ] PWA manifest + service worker (préparer wrapper iOS/Android)

---

## 12. Récap synthèse v2

| Catégorie | ✅ | 🟡 | 🔴 | Notes |
|---|---|---|---|---|
| Public | 3 | 0 | **10** | 4 légal (RGPD) + 1 pilotes + erreurs |
| Auth/Onboarding | 3 | 2 | **6** | PIN auth + consent + role-select |
| Élève (`/accueil`) | 6 routes existantes (rename) + 5 à créer | | **5 nouvelles** | Polish + 5 nouvelles pages |
| Prof (`/accueil`) | 18 routes existantes (rename) | 3 | **11 nouvelles** | Heatmap + curation extension + improvements |
| Admin | 2 | 1 | 0 | Transient — pas d'effort |
| Settings/RGPD | 0 | 0 | **8 critiques + 5 UX** | Bloquant pilote |
| Erreurs | 0 | 0 | **7** | Polish défensif |
| **TOTAL** | **~32 routes vivantes** | **6** | **~52 routes à créer + 9 sprints** | |

**Estimation totale MVP** (sprints 0-8) : **~25-32 jours-dev** + ~3-5 jours QA. Cohérent avec la spec §6 (20-28 j-h estimés).

**Effort réduit grâce aux orphelins** : ~8-10 jours économisés (composants UI déjà buildés, à câbler seulement).

---

## 13. Questions résiduelles (à arbitrer si besoin)

1. **`/onboarding/role-select`** : si toute connexion passe par invitation école (avec metadata role pré-rempli), cette page est inutile. Confirmer ?
2. **Plan Maïa = adaptation `StudyWizard` ou nouvelle UI ?** Le wizard existant est très complet (4 étapes), peut-être overkill pour un quick-start 20 min.
3. **Heatmap prof : pure React from mockup, ou framework canvas (Recharts/Visx) ?** Le mockup HTML est en SVG inline, transposition directe possible mais nécessite calibration mobile.
4. **Notifications in-app** : système custom (table `notifications` + Supabase Realtime) ou solution tierce (Knock, NovuHQ) ? Custom = plus de contrôle RGPD.
5. **SmartSchool SSO** : as-tu déjà des contacts technique chez eux ? Leur OAuth est-il documenté publiquement ?

---

**Source de vérité** : ce document. Tous les arbitrages produit Alex (mémoires `project_tenant_routing_flat`, `feedback_landing_tone_adult_kind`, `feedback_lucide_icons_except_tutor`, `project_landing_pilots_3_schools`, `project_plan_maia_daily`, `project_live_session_kahoot_year`, `feedback_no_pricing_public`, `feedback_no_student_profile_route`) sont intégrés.

**Mis à jour** : 2026-05-15.
