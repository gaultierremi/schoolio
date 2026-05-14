# Maïa MVP — Design Spec

**Version :** 1.0
**Date :** 13 mai 2026
**Audience :** Founders Maïa, équipe technique, juriste (DPIA stub)
**Statut :** Validation founders requise avant invocation `writing-plans`

---

## 1. Vision et positionnement

Maïa est une **plateforme de renforcement adaptive** pour l'enseignement secondaire francophone, alignée curriculum officiel FW-B (Belgique). Différenciateur produit :

- **Le prof reste l'autorité pédagogique** : l'IA prépare le contenu (questions, théorie, indices, explications), le prof valide, l'élève consomme.
- **0 IA en runtime face à l'élève** : tout est pré-baked en batch lors de l'ingestion du syllabus. Comparaison déterministe, feedback instantané, latence < 100 ms.
- **Boucle d'apprentissage continue** : Maïa capture les cas non anticipés (silencieusement) et propose au prof asynchroniquement des enrichissements à valider.

Positionnement marketing : *"Renforcement adaptive avec curriculum officiel curé par ton prof, et une bank qui apprend de tes élèves."* Pas *"AI tutor"*. Pas *"remplace le prof"*.

## 2. Scope MVP

### 2.1 Dans le scope (MVP livrable testable par l'équipe)

- **Multi-tenant** avec premier tenant "FounderTestGround"
- **Matières** : Histoire (CESS G FW-B) + Chimie (CESS G FW-B)
- **5 fondations EU-ready** : i18n structure + curriculum-as-data + EU hosting + SSO design + prompt templating
- **Pipeline d'ingestion** : upload syllabus PDF → chunking par UAA → batch Claude (pattern solve→format pour multi-step) → DB peuplée
- **8 outputs par concept** : theory, questions, step-by-step solutions, misconceptions, hints banks ordonnées, explanations par distracteur, source_quote, métadonnées
- **Curation prof** : UI dédié pour review/edit/reject contenu généré
- **Quiz UI élève** : QCM, numeric, short text exact, short text fuzzy, multi-step structuré
- **Toolbar Unicode + mode chimie/physique auto-convert** (Niveau A+B)
- **Feedback instant** : ✅/❌ déterministe + correction pas-à-pas + panel Tuteur IA avec indices pré-baked templates+slots + boutons "👍/👎 indice utile"
- **Heatmap élève** ("Mes lacunes" — mockup `dashboard-eleve-heatmap-mockup.html`)
- **Heatmap prof** ("Carte de maîtrise classe" — mockup `dashboard-prof-heatmap-mockup.html`)
- **Boucle post-session** : capture silencieuse des réponses non-matchées, agrégation hebdo, IA propose au prof des nouvelles misconceptions à ajouter
- **Auth** : Google OAuth (SSO M365 et Google Workspace EDU = post-MVP)
- **DPIA stub minimum** : registre des traitements, consent flow, droit à l'oubli (audit externe = post-MVP, avant pilote école payant)
- **i18n** : structure complète + FR uniquement (autres langues = post-MVP)
- **Branding Maïa** : palette validée, logo, domaine de test
- **Tests** : Vitest unitaires sur comparateurs déterministes, Playwright E2E sur flux prof + élève

### 2.2 Hors scope MVP (post-MVP / v1.1+)

- ❌ Math editor avancé (MathLive / fractions / intégrales) — Niveau A+B suffit pour Histoire et Chimie
- ❌ SSO M365 EDU et Google Workspace EDU (Google OAuth standard suffit)
- ❌ Gamification avancée (badges, streaks, leaderboards)
- ❌ Mode contrôle / examen verrouillé
- ❌ Live sessions (cours en direct prof projetant questions)
- ❌ Free-text long avec grading IA (rédaction = exercice hors Maïa)
- ❌ DPIA externe certifié + audit sécurité (à externaliser avant pilote école)
- ❌ Traductions NL/DE/EN/FR-FR (structure i18n prête, traductions = freelancer)
- ❌ Matières autres que Histoire et Chimie

### 2.3 Critères de "MVP testable"

L'équipe doit pouvoir :
1. Créer un compte prof dans le tenant "FounderTestGround"
2. Uploader un syllabus FW-B PDF → voir le contenu généré IA en < 15 min
3. Valider/éditer ce contenu via l'UI de curation en < 1 h
4. Créer une classe + inviter des élèves de test
5. Démarrer une session quiz côté élève
6. Voir le feedback instantané (correct/erreur) + indices contextualisés + correction pas-à-pas
7. Voir la heatmap élève évoluer après la session
8. Voir la heatmap classe côté prof
9. Le tout sans aucun appel IA en runtime visible côté élève (validable via logs)

## 3. User personas et flux principaux

### 3.1 Prof

**Flow rentrée scolaire (1× / an / syllabus)**
1. Login → Tenant "FounderTestGround" → Mon espace
2. "Ajouter un syllabus" → upload PDF → choisir matière (Histoire / Chimie) → lancer ingestion
3. Attendre 5-15 min (batch IA tournant en arrière-plan)
4. Notification "Ton syllabus est prêt à curer"
5. Curation : review concept par concept, valider/éditer/rejeter théorie + questions + misconceptions + indices
6. Publier → le contenu devient utilisable dans les classes

**Flow année scolaire**
1. Créer une classe (nom, matière, niveau)
2. Inviter des élèves (lien partageable)
3. Créer un devoir : sélectionner concepts à travailler, due date → distribuer
4. Suivre la classe via la heatmap : voir les concepts maîtrisés vs à reprendre
5. Recevoir hebdomadairement les suggestions IA d'enrichissement de la bank (boucle post-session) → valider 0-5 nouveaux indices/misconceptions par semaine

### 3.2 Élève

**Flow session quiz**
1. Login → "Mon dashboard" → voir la heatmap personnelle "Mes lacunes"
2. "Démarrer ma session du jour" → l'algorithme sélectionne le mix optimal (concepts faibles + spaced repetition)
3. Répondre aux questions, recevoir feedback instantané
4. Sur erreur : voir l'explication pas-à-pas + panel Tuteur IA avec indices (templates remplis avec sa propre réponse) + boutons "Autre indice / Revoir théorie / 👍 utile / 👎 pas utile"
5. À la fin : voir l'évolution de sa heatmap, XP gagné (gamification simple), prochaine session recommandée

## 4. Architecture technique

### 4.1 Stack

- **Frontend** : Next.js 14 (App Router), React 18, Tailwind 4, KaTeX (rendu formules)
- **Backend** : Next.js API Routes + Supabase
- **DB** : PostgreSQL (Supabase managed, region EU-Central)
- **Auth** : Supabase Auth + Google OAuth (post-MVP : M365 + Workspace EDU)
- **Storage** : Supabase Storage (PDFs syllabi)
- **IA** : Anthropic Claude Sonnet 4.5 via Anthropic API, batch ingestion seulement
- **Hosting** : Vercel (preview + prod), repo GitHub @gaultierremi
- **Job runner** : Inngest ou queue Postgres simple (pour batch ingestion async)
- **Monitoring** : Vercel Analytics + Supabase logs + Sentry pour erreurs front
- **Tests** : Vitest (unit), Playwright (E2E)

### 4.2 Architecture haut niveau

```
┌─────────────────────────────────────────────────────────────────┐
│ PROF UI (Next.js)              ÉLÈVE UI (Next.js)               │
│ ┌────────────────┐             ┌────────────────┐               │
│ │ Upload syllabi │             │ Quiz adaptive  │               │
│ │ Curation UI    │             │ Heatmap élève  │               │
│ │ Heatmap classe │             │ Indices+théo   │               │
│ └────────────────┘             └────────────────┘               │
│         ▲                              ▲                         │
│         │                              │                         │
└─────────┼──────────────────────────────┼─────────────────────────┘
          │                              │
          │ HTTPS REST                   │ HTTPS REST (instant)
          ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ API LAYER (Next.js routes)                                       │
│ /api/syllabi/* /api/curation/* /api/quiz/* /api/heatmap/*       │
└─────────────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│ POSTGRES (Supabase)     │    │ JOB RUNNER (Inngest)    │
│ - schools (tenants)     │    │ - Ingestion batch       │
│ - users / classes       │    │ - Post-session loop     │
│ - curriculum_programs   │    │                         │
│ - concepts / theory     │    │   ↓ batch IA calls      │
│ - questions / steps     │    │                         │
│ - misconceptions        │    │ ┌───────────────────┐   │
│ - hint_banks            │    │ │ ANTHROPIC API     │   │
│ - mastery / attempts    │    │ │ claude-sonnet-4-5 │   │
│ - audit_log             │    │ └───────────────────┘   │
└─────────────────────────┘    └─────────────────────────┘
```

**Principe clé :** le path "ÉLÈVE UI → API → POSTGRES → réponse" ne touche **jamais** l'API IA. Tous les appels IA sont confinés au job runner asynchrone, déclenché par actions prof (upload syllabus, validation hebdo de la boucle post-session).

### 4.3 Pipeline d'ingestion détaillé

```
1. Upload PDF              → Storage Supabase
2. Job queued              → Inngest
3. PDF text extraction     → pdf-parse / pdftotext -layout
4. Pré-traitement markdown → linéarisation des PDFs à colonnes
                             (Histoire FW-B, exemple) ; déduction des titres
                             par patterns + reconstruction logique des blocs
5. Chunking par UAA        → règles regex + heuristiques sur structure FW-B
6. Pour chaque UAA :
   a. Extraction concepts  → batch Claude (1 appel)
   b. Pour chaque concept :
      - Theory             → Claude 1 appel (extrait + reformule, avec source_quote
                              ou source_concept_path fallback si extraction
                              verbatim échoue)
      - Questions pool     → Claude N appels (pattern solve→format pour multi-step)
      - Misconceptions     → Claude 1 appel
      - Hint banks         → Claude 1 appel par misconception
      - Explanations par distracteur → généré inline lors des questions
7. Validation JSON schema  → rejet et retry si malformé (max 2)
8. Stockage en DB          → tables liées au school_id
9. Notification prof       → "Ton syllabus est prêt à curer"
```

**Note importante (apprentissage smoke test Histoire) :** les syllabi FW-B sont
souvent en disposition 2 colonnes (intitulés / méthodes pédagogiques). Une
extraction `pdftotext -layout` naïve fragmente le contenu et empêche l'IA de
respecter un `source_quote` verbatim. L'étape 4 (pré-traitement markdown) est
**non négociable** dans le pipeline d'ingestion MVP.

Coût estimé : ~$15-30 par syllabus complet, mutualisé sur classe × années.

### 4.4 Multi-tenant

- Table `schools` avec `id`, `name`, `created_at`. Premier tenant seedé : "FounderTestGround".
- Toutes les tables sensibles ont une colonne `school_id` indexée.
- RLS Supabase étendue : `auth.uid()` → lookup `users.school_id` → toutes les requêtes filtrent automatiquement.
- Un user appartient à exactement 1 school dans le MVP (multi-membership = post-MVP).

## 5. Modèle de données (vue d'ensemble)

Tables principales du schéma Maïa (vue résumée — schéma détaillé dans le plan d'implémentation) :

| Table | Rôle principal |
|---|---|
| `schools` | Tenants. Le tout premier : FounderTestGround. |
| `users` | Profs et élèves. Chaque user appartient à 1 school. Rôles : `teacher`, `student`. |
| `classes` | Groupes scolaires. Possède un teacher_id. |
| `class_memberships` | Élèves d'une classe. |
| `curriculum_programs` | Référentiels officiels (FW-B CESS G, etc.) avec country, region, level, subject. |
| `uaa` | Unités d'Acquis d'Apprentissage (subdivisions du programme officiel). |
| `concepts` | Concepts pédagogiques rattachés à 1 UAA + 1 program. |
| `concept_theory` | Théorie associée à un concept (def, formules, exemples, prereqs, pitfalls). |
| `misconceptions` | Erreurs typiques élèves rattachées à 1 concept. |
| `questions` | Pool de questions par concept. Type, difficulty, format-spécifique. Inclut `inference_chain` (raisonnement IA depuis le syllabus jusqu'à la question) et `needs_teacher_review` (flag automatique si inférence non triviale). |
| `question_steps` | Pour les multi-step : définition de chaque étape avec inputs attendus. |
| `question_choices` | Pour les QCM : 4 choix + explanation par distracteur. |
| `question_acceptables` | Pour les short_text fuzzy : liste de réponses acceptables/quasi/mauvaises. |
| `hint_banks` | Indices ordonnés rattachés à (concept × misconception). Templates avec slots. |
| `syllabi` | PDFs uploadés par les profs. `school_id`, `teacher_id`, `ingestion_status`. |
| `ingestion_jobs` | Suivi des batchs IA. Status, errors, retries. |
| `assignments` | Devoirs créés par les profs. Sélection de concepts, due_date, class_id. |
| `quiz_sessions` | Sessions élèves. Démarrage, fin, score, durée. |
| `quiz_answers` | Réponses individuelles. Question_id, raw_input, detected_misconception, was_correct, hints_used. |
| `user_concept_mastery` | Score SM-2 par (user, concept). Mis à jour à chaque réponse. |
| `hint_feedbacks` | 👍/👎 par (user, hint, occurrence). Alimente la curation. |
| `unmatched_answers` | Réponses non-matchées capturées pour la boucle post-session. |
| `improvement_suggestions` | Propositions IA hebdo au prof pour enrichir la bank. |
| `audit_log` | Log immuable des actions sensibles (RGPD). |
| `consent_records` | Consentements RGPD par user. |

## 6. Sprint breakdown (vue d'ensemble)

Détail des tâches à produire via `writing-plans`. Estimation calendaire 8-12 semaines avec 1 dev focus + 1 dev support.

| Sprint | Contenu | Effort |
|---|---|---|
| **S0 — Foundation** | Rebrand Maïa, cleanup Schoolio non-pertinent, multi-tenant schéma, RLS étendue, i18n structure, EU hosting config | 3-4 j |
| **S1 — Pipeline ingestion** | Upload syllabi, chunking UAA, batch Claude (pattern solve→format), stockage 8 outputs, ingestion_jobs status | 3-4 j |
| **S2 — Curation prof** | UI list concepts, edit theory / questions / misconceptions / hints, publier/regénérer, notifications | 2-3 j |
| **S3 — Quiz UI élève** | Composants par type (QCM/numeric/short text/multi-step), toolbar Unicode+chimie, détection misconception, feedback instant, panel Tuteur IA, boutons indice/théorie/👍👎 | 4-5 j |
| **S4 — Heatmaps + dashboards** | Heatmap élève "Mes lacunes", heatmap prof classe, algo SM-2 + concept_mastery, suggestions remédiation | 2-3 j |
| **S5 — Auth + classes + tests** | Google OAuth, création classe, invitation élèves, comptes test, RLS multi-tenant, tests Vitest + Playwright | 2-3 j |
| **S6 — Boucle post-session** | Capture unmatched_answers, agrégation hebdo, génération improvement_suggestions par batch IA, UI prof "Suggestions pour ta bank" | 2-3 j |
| **S7 — DPIA stub + i18n complet + polish** | Registre traitements, consent flow, droit oubli endpoint, audit i18n (extraction strings + traduction FR complète), audit accessibilité de base, debug | 2-3 j |
| **Contenu** | Ingestion réelle Histoire CESS G + Chimie CESS G, curation par 1 prof (Alex ou Rémi) | 1 j tech + ~10h prof |
| **Total** | | **20-28 j-h dev focus** |

## 7. Contraintes non fonctionnelles

- **Latence runtime élève** : < 200 ms pour afficher une question, < 100 ms pour feedback
- **Hosting EU** : Supabase region EU-Central (Frankfurt), Vercel EU regions
- **RGPD** : Consent explicite à la création de compte, droit oubli implémenté (suppression cascade), registre des traitements documenté
- **Accessibilité** : niveau de base WCAG 2.1 AA sur les composants critiques (quiz, dashboards)
- **Sécurité** : RLS sur 100 % des tables sensibles, audit_log immuable des actions admin, secrets en env vars uniquement, pas de PII dans les logs
- **Provenance IA stricte** : chaque contenu généré a un champ `source_quote` traçable au syllabus
- **Tests** : couverture > 70 % sur les comparateurs déterministes et les routes API critiques

## 8. Décisions actées (rationale courte)

| Décision | Valeur | Rationale |
|---|---|---|
| Pricing | €36/élève/an | Premium positioning, marge ~97 % avec architecture 0-IA-runtime, permet d'investir dans la qualité produit |
| Matières MVP | Histoire + Chimie | 2 familles très différentes (SHS qualitatif + sciences quantitatif), validation cross-format de l'archi |
| 5 fondations EU-ready | Bakées MVP | Coût upfront 3-4 j vs 2-3 semaines retrofit après pivot |
| Banks Socratiques | Implémentées MVP | Différentiel ~30 points de marge vs live IA, principe non-négociable |
| Multi-tenant | Dans MVP | FounderTestGround comme premier tenant, archi multi-école validée dès le départ |
| DPIA | Stub minimum MVP | Suffisant pour tests internes ; audit externe à externaliser avant pilote école payant |
| i18n | Structure + FR complet | Coût marginal d'ajouter une langue après = 90 % structure (déjà bakée), 10 % traductions |
| Boucle post-session | Dans MVP | Différenciateur produit, le moyen de récupérer la valeur "intelligence IA" perdue en supprimant le live tutor |
| Math editor | Niveau A+B seulement | Unicode + auto-convert chimie/physique suffit pour les 2 matières MVP. MathLive = v1.1 si maths complexes ajoutées. |
| Provenance | Stricte syllabus uniquement | Argument trust massif pour pitch école + autorités FWB ; chaque contenu a un `source_quote` verbatim OU `source_concept_path` (titre section + sous-titre) si l'extraction verbatim n'est pas possible (PDF colonnaires) |
| Prompt distracteurs | "Misconception documentée uniquement" | Apprentissage smoke test Histoire : ~15 % des distracteurs étaient éliminables par bon sens. Le prompt système v3 doit durcir : "AUCUN distracteur ne doit être éliminable par bon sens général ; chaque mauvaise réponse correspond à une erreur réellement commise par un élève de 5e/6e secondaire" |
| Garde-fou anti-glissement sémantique | Champ `inference_chain` + flag `needs_teacher_review` | Apprentissage Q9 Histoire : Claude a transformé une date repère du syllabus ("monde de 1945 à aujourd'hui") en réponse à une question sur la date de début d'un événement précis. La provenance verbatim étant mécaniquement OK, seul un raisonnement explicite peut alerter le prof. La curation prof reste le filet final. |
| Tuteur Socratique | Système d'indices pré-baked, pas chatbot | Architecture 0-IA-runtime + 0 risque leak réponse + curation prof native |
| Saisie élève | Multi-step structurée + toolbar | Permet la détection déterministe des misconceptions sans IA runtime |

## 9. Métriques de succès MVP

### Techniques (validables par tests)
- ✅ Aucun appel IA dans le path élève → API → DB (auditable via logs)
- ✅ Tous les comparateurs runtime sont déterministes (tests unitaires Vitest > 70 % coverage)
- ✅ Latence quiz < 200 ms p95 (load testing simple)
- ✅ RLS multi-tenant : un user d'une école ne peut pas accéder aux data d'une autre (test Playwright dédié)
- ✅ Provenance : 100 % des contenus IA ont un `source_quote` non-vide

### Produit (validables par démo équipe)
- ✅ 1 prof peut uploader 1 syllabus FW-B, voir le contenu généré en < 15 min, le curer en < 1 h, publier
- ✅ 1 élève peut faire un quiz et voir : feedback instant, indices contextualisés avec sa propre réponse, correction pas-à-pas, évolution heatmap
- ✅ Démo end-to-end Histoire + Chimie réalisable en 10 min devant un founder externe
- ✅ La heatmap classe côté prof affiche correctement les lacunes agrégées

### Business (post-démo équipe)
- À l'issue du MVP, l'équipe valide unanimement si on enchaîne sur :
  - **(a) DPIA externe + premier pilote école** (passage en pré-revenue avec 1-2 écoles BE)
  - **(b) Itération MVP** (corrections majeures avant pilote)
  - **(c) Pivot** (si le produit ne convainc pas en interne)

## 10. Risques connus et mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Histoire smoke test échoue | ~~Moyenne~~ Résolue | ~~Élevé~~ | ✅ Smoke test passé le 13 mai 2026 (GO unanime, 4.1/5 moyenne). Cf. `/tmp/smoke-test-histoire.json` et campagne complète $0.90. |
| PDF syllabus à 2 colonnes (Histoire) cassant l'extraction texte | Confirmée | Moyen | Pipeline ingestion §4.3 étape 4 : pré-traitement markdown avant chunking UAA. |
| Coût IA ingestion > prévu (PDF lourds) | Moyenne | Faible | Coût mutualisé sur années × élèves, budget €200-500/mois absorbe largement |
| Multi-tenant retrofit douloureux | Faible | Élevé | Bakée dès S0, RLS testée dès le départ |
| Calibration difficulté faible sur certaines questions | Élevée (mesurée à 3.5/5) | Faible | Curation prof obligatoire avant publication ; boucle post-session corrige avec le temps |
| Glissement sémantique invisible (provenance technique OK mais inférence inappropriée — cas Q9 Histoire 1945) | Moyenne | Moyen | Champ `inference_chain` rendu visible au prof dans l'UI de curation + flag `needs_teacher_review` automatique sur inférences non triviales |
| Pattern "solve → format" multi-step non robuste sur tous types d'exercices | Moyenne | Moyen | Tests d'intégration sur 10-20 questions par matière en S1 ; fallback : question marquée "needs prof review" |
| DPIA stub insuffisant pour pilote école | Élevée | Moyen (bloque pilote payant) | Externalisation DPIA prévue post-MVP avant signature pilote |
| Charge curation prof trop élevée | Moyenne | Élevé (UX prof rédhibitoire) | UX curation conçue pour validation par batch (valider/rejeter en lots) + édition rapide |
| Adoption élève faible si feedback générique sur réponses non-matchées | Moyenne | Moyen | Capture des cas non-matchés alimente la boucle d'amélioration ; itération continue |

## 11. Hors du document (à traiter à part)

- **Roadmap commerciale post-MVP** : démos écoles, pipeline politique FWB (cf. business case Section 6)
- **DPIA externe** : RFP à émettre dès validation MVP, juriste edtech BE
- **Plan d'industrialisation** : passage du MVP testable à la prod scalable (CI/CD, monitoring, alerting, support)
- **Pricing finalisé €36/an** : déjà acté, détails facturation/SEPA/Stripe à designer en S6 ou post-MVP

---

## Validation requise

Ce spec doit être revu et validé par les founders avant le passage à `writing-plans`. Points spécifiques à arbitrer :

1. **Scope MVP** : tout ce qui est en §2.1 est-il bien attendu pour le MVP testable ?
2. **Sprint breakdown** : l'ordre et le découpage en §6 conviennent-ils ?
3. **Risques** : les mitigations en §10 sont-elles acceptables ?
4. **Métriques de succès** : §9 capte-t-il bien ce que "MVP réussi" veut dire ?

**Une fois validé, le passage à `writing-plans` produira un plan d'implémentation détaillé tâche par tâche dans `docs/superpowers/plans/2026-05-13-maia-mvp-plan.md`.**
