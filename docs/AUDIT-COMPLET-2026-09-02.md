# Audit complet — Maïa

**Date** : 2026-09-02 · **Commit audité** : `b91c7d2` (main) · **Méthode** : lecture seule, aucune écriture hors ce fichier.

> **Réserve d'indépendance.** Cet audit n'a pas été produit par une instance vierge : la même session a livré le sprint horaire (`b91c7d2`) et un seed de board plus tôt dans la journée. Les findings ci-dessous s'appuient tous sur des références `fichier:ligne` vérifiées, mais l'angle mort classique de l'auto-audit s'applique — un relecteur externe reste souhaitable sur les zones que j'ai moi-même touchées (`app/accueil/horaire/*`).
>
> Hors périmètre par consigne : les 7 fuites RLS anon déjà fermées, la dette C2 (RLS sur le remote, pas dans les migrations), la faille `validate-code`. Vérification d'état uniquement, pas de re-documentation.

---

## Résumé exécutif

Maïa est un produit fonctionnel dont le cœur pédagogique tourne, mais dont trois couches se contredisent : un socle sain (helpers, garde-fous qualité, tests unitaires), une couche produit inachevée (chaînes construites mais non branchées), et une couche de reliques du pivot HistoGuess qui **pollue activement l'interface prof et le contenu**.

Le risque numéro un n'est pas une faille : c'est **la suppression d'une classe**, qui détruit en cascade et sans avertissement l'intégralité de l'historique élève — devoirs, scores, réponses, présences — c'est-à-dire exactement les données que le produit déclare vouloir exploiter en stats de direction. Un clic, irréversible, exposé à tout prof.

Viennent ensuite trois chaînes construites à 90 % puis abandonnées avant le dernier maillon : les **exercices** (7 routes, un générateur IA, une UI de validation — aucun n'atteint jamais un élève), l'**inscription par lien** (le rattachement à la classe n'existe que pour un chemin email/mot de passe lui-même inatteignable), et la **validation des questions** (deux colonnes d'état, deux onglets, un seul écrit celle qui débloque les devoirs).

Les reliques HistoGuess ne sont pas dormantes : un filtre « période » historique qui ne matchera jamais rien, un composant carte qui masque l'image que le prof doit juger, un message renvoyant le prof vers Supabase Studio. Le prof beta valide donc du contenu qu'il ne voit pas tel que l'élève le verra.

Enfin, la dette structurelle est mesurable : **96 routes API sur 117 ignorent les helpers d'auth et d'erreur** du projet, et **zéro test ne couvre une route API** (288 tests, tous sur de la logique pure).

---

## État des features

| Feature | État | Rupture principale |
|---|---|---|
| Import de cours + ingestion | **Partiel** | Le job tourne, mais l'écran de fin renvoie le prof vers « Supabase Studio » ([StatusClient.tsx:223](../app/accueil/ingestion/[jobId]/StatusClient.tsx#L223)) |
| Génération questions — pipeline A (texte) | **Complet** | Fonctionne de bout en bout, garde-fou `needs_review` en place |
| Génération questions — pipeline B (images) | **Partiel** | Derrière `PIPELINE_B_ENABLED`, OFF par défaut ([feature-flags.ts:4](../lib/feature-flags.ts#L4)). Produit des chemins topojson vers des assets absents |
| Curation / validation | **Cassé** | Double-gate : l'onglet par défaut n'écrit pas la colonne qui débloque les devoirs |
| Devoirs — PDF | **Complet** | — |
| Devoirs — quiz | **Partiel** | Bloqué en amont par le double-gate ; compteur de cours mensonger |
| Devoirs — exercices | **Cassé** | Non assignables : `resource_type` n'accepte que `pdf`/`quiz` |
| Mode live / cockpit | **Partiel** | Chaîne complète (start/join/host/answer), mais lien d'entrée erroné et une table concurrente morte |
| Concours médecine | **Inexistant** | Une entrée de matière + une ligne de prompt. Ce n'est pas une feature |
| Inscription élève — SSO Google | **Cassé** | Authentifie mais ne rattache jamais à la classe |
| Inscription élève — email/mdp | **Inatteignable** | Le middleware redirige vers `/login`, qui ne propose que Google |

---

## Findings

Sévérités : **B** bloquant produit · **D** dette lourde · **F** friction · effort **S** (< 1 j) / **M** (1-3 j) / **L** (> 3 j).

### Thème 1 — Intégrité des données

#### B1 · Supprimer une classe détruit tout l'historique élève — `L`

[`app/api/classes/[id]/route.ts:166`](../app/api/classes/[id]/route.ts#L166) exécute `admin.from("classes").delete()`. La cascade FK part de là :

| Table | FK | Effet |
|---|---|---|
| `class_memberships` | [migration:49](../supabase/migrations/20260508100000_create_classes_and_memberships.sql#L49) | `ON DELETE CASCADE` |
| `assignments` | [migration:9](../supabase/migrations/20260509100000_recreate_assignments.sql#L9) | `CASCADE` |
| `assignment_completions`, `assignment_questions`, `assignment_question_answers` | via `assignment_id` | `CASCADE` |
| `class_attendance_records`, `class_audit_log`, `student_random_picks` | `class_id` | `CASCADE` |

**Pourquoi ça compte.** La règle 23 de `CLAUDE.md` interdit explicitement le `DELETE` sur `class_memberships`, `assignment_completions`, `assignment_question_answers`, `activity_events` et `class_audit_log`, au motif que la direction voudra des stats de rétention longitudinales. Cette route les efface **toutes**, d'un coup, sans passer par `.delete()` sur ces tables — donc invisible à toute revue qui grep `DELETE FROM class_memberships`. Le `class_audit_log`, décrit comme « immutable par RLS », part avec le reste.

Le garde-fou UX est insuffisant : la modale ([classes/[id]/page.tsx:95-97](../app/accueil/classes/[id]/page.tsx#L95)) annonce *« et tous ses membres seront supprimés »*. Un prof comprend « je perds la liste d'élèves ». Il perd en réalité tous les scores jamais obtenus dans cette classe. Et `archived_at` existe déjà sur `classes`, avec une action d'archivage dans l'UI : le chemin non destructif est là, à côté.

**Fix.** Retirer la route DELETE au profit de l'archivage, ou passer les FK critiques en `ON DELETE RESTRICT` et exiger l'archivage préalable. Migration nécessaire.

#### D1 · Tables jamais alimentées — `S`

Aucune référence dans `app/`, `lib/`, `components/` : `live_question_answers` (doublon mort de `live_session_answers`, seule utilisée — [host/route.ts:81](../app/api/live/[id]/host/route.ts#L81)), `student_random_picks`, `beta_access_requests`, `beta_whitelist`, `beta_feedback_comments`, `beta_feedback_status_history`. Et `class_audit_log` existe, est cité par la règle 23, mais **n'est écrit par aucun code applicatif**.

À l'inverse, la règle 23 cite `quiz_completions` — table qui **n'existe dans aucune migration**. La règle protège un fantôme et laisse `class_audit_log` vide.

#### D2 · Typage divergent sur `level` — `M`

`classes.level` est `text NULL` ([migration:21](../supabase/migrations/20260508100000_create_classes_and_memberships.sql#L21)), `courses.level` est `smallint` ([migration:9](../supabase/migrations/20260505090000_create_courses.sql#L9)). Toute jointure ou filtre croisé classe↔cours par niveau exige une conversion, jamais explicitée. C'est la trace de deux modèles conçus séparément.

---

### Thème 2 — Reliques HistoGuess

Distinction demandée : **active** = impacte l'UX ou le contenu aujourd'hui ; **dormante** = code mort à supprimer.

#### B2 · ACTIVE — Le composant carte masque l'image que le prof doit juger — `S`

[`app/_components/GeoMap.tsx`](../app/_components/GeoMap.tsx) est un stub qui affiche le chemin brut du fichier et la mention *« (rendu SVG interactif en PR future) »*. Il est branché dans la curation ([PendingCard.tsx:77-78](../app/accueil/curation/_components/PendingCard.tsx#L77)) **avant** la branche `<img>` : pour toute question de type carte, le prof voit `/topojson/belgium.json` **à la place de l'image**.

Aggravant : ces chemins ([image-questions.ts:172-178](../lib/generate-questions/image-questions.ts#L172)) pointent vers `/topojson/*.json`, et **`public/topojson/` n'existe pas**. L'asset n'a jamais été livré.

**Pourquoi ça compte.** Le prof doit valider une question sur une carte qu'il ne voit pas. Il valide à l'aveugle ou rejette par défaut. C'est du contenu payé (appel vision + génération) rendu invalidable.

#### B3 · ACTIVE — Le filtre « période » ne peut jamais matcher — `S`

[`curation/_types.ts:92`](../app/accueil/curation/_types.ts#L92) définit `PERIODS = ["Préhistoire", "Antiquité", "Moyen Âge", …]`, servi tel quel dans le menu déroulant ([FilterBar.tsx:52](../app/accueil/curation/_components/FilterBar.tsx#L52)).

Or la colonne `period` a été **réaffectée** : le pipeline y écrit le titre du chapitre ([run-text-pipeline.ts:381](../lib/generate-questions/run-text-pipeline.ts#L381) `period: chapter.title`, idem [image-questions.ts:342](../lib/generate-questions/image-questions.ts#L342)), et le menu latéral l'expose comme « Thème / chapitre » ([SubjectSidebar.tsx:45](../app/accueil/curation/_components/SubjectSidebar.tsx#L45)).

**Deux composants lisent la même colonne avec deux sémantiques incompatibles.** Le filtre « période » du FilterBar renvoie donc systématiquement zéro, pour toutes les matières, y compris l'histoire — puisque les valeurs stockées sont des titres de chapitres, pas des périodes.

#### B4 · ACTIVE — Instructions de développeur exposées au prof — `S`

[`StatusClient.tsx:223`](../app/accueil/ingestion/[jobId]/StatusClient.tsx#L223), écran de fin d'import : *« Sprint 2 ajoutera l'UI de curation. Pour l'instant, vérifie en base via Supabase Studio. »* C'est le dernier écran du parcours d'import, celui qui devrait mener à la curation. Il envoie un prof dans une console Postgres.

Même famille : l'onglet « Par état (**legacy**) » — le seul qui débloque réellement les devoirs (cf. B5) — porte notre vocabulaire de dette dans l'UI, avec une étiquette qui invite à ne pas l'utiliser.

#### D3 · DORMANTE — `image-proxy` : proxy SSRF non authentifié et sans appelant — `S`

[`app/api/image-proxy/route.ts`](../app/api/image-proxy/route.ts) accepte un paramètre `url` arbitraire, n'exige **aucune authentification**, autorise `http:` autant que `https:`, et fetch côté serveur. Le User-Agent est `StoryGuessr/1.0` — un troisième nom de produit, antérieur au pivot.

`grep -rn "image-proxy"` hors du fichier lui-même : **zéro appelant**. Ce code est mort *et* déployé.

**Pourquoi ça compte.** Même si le `content-type` doit commencer par `image/`, les messages d'erreur distinguent `Upstream returned {status}` / « Not an image » / 502 — de quoi scanner ports et hôtes internes depuis l'infra Vercel. Suppression pure, pas de correctif à écrire : rien ne l'appelle.

#### D4 — DORMANTES diverses — `S`

`geo_topojson_path` reste en base ([migration](../supabase/migrations/2026-05-15-100000-add-image-fields-to-teacher-questions.sql#L16)) et dans les selects. `vision-classify.ts` continue de demander au modèle un `topojson_region_hint` (coût de tokens pour un champ qui ne sert à rien). `MoleculeRenderer` est un stub affichant le SMILES brut.

Point positif à mettre au crédit de l'équipe : [`20260509160000_drop_legacy_histoguess.sql`](../supabase/migrations/20260509160000_drop_legacy_histoguess.sql) a réellement supprimé `duels`, `duel_results`, `timeline_events` et l'ancienne table `questions`. **Il n'y a plus deux systèmes de questions** — `teacher_questions` est seule (63 références). Le nettoyage de fond a été fait ; ce sont les branches périphériques qui sont restées.

---

### Thème 3 — Features cassées

#### B5 · Double-gate de validation : le prof valide dans le mauvais onglet — `M`

- L'onglet par défaut « Par concept » n'écrit que `is_active` ([toggle-active/route.ts:112](../app/api/curation/[id]/toggle-active/route.ts#L112)).
- `validated_at` ne s'écrit que dans « Par état (legacy) » ([validation/route.ts:111](../app/api/teacher-questions/[id]/validation/route.ts#L111)).
- La création de devoir exige **les deux** ([assignments/route.ts:248-251 et 291-294](../app/api/classes/[id]/assignments/route.ts#L248)).

Un prof qui reste dans l'onglet par défaut ne pose jamais `validated_at` : ses questions s'affichent comme validées et sont refusées à l'assignation. Le code annonce déjà la sortie ([validation/route.ts:102](../app/api/teacher-questions/[id]/validation/route.ts#L102) : *« Sprint 2C dropera validated_at/rejected_at au profit de is_active seul »*) — la dette est identifiée mais non soldée, et elle bloque le parcours nominal.

#### B6 · Les exercices ne sont assignables par aucun chemin — `L`

Investissement constaté : table `exercises` + `exercise_steps`, générateur IA ([lib/exercises/generate-exercises.ts](../lib/exercises/generate-exercises.ts)), 7 routes API (create, validate, reject, archive, restore…), une UI de génération par plage de pages.

Verrou : `resource_type` n'accepte que `'pdf'` ou `'quiz'`, aux deux niveaux — rejet 400 ([assignments/route.ts:186](../app/api/classes/[id]/assignments/route.ts#L186)) **et** `CHECK` en base ([migration:13](../supabase/migrations/20260509100000_recreate_assignments.sql#L13)). Aucun exercice généré n'a jamais pu atteindre un élève, alors que le dashboard prof compte des « exercices à valider ».

#### B7 · Inscription par lien : le rattachement à la classe n'existe que sur un chemin inatteignable — `M`

Deux chemins seulement créent un `class_memberships` : [join-full:133](../app/api/classes/[id]/join-full/route.ts#L133) (crée le compte, échoue en 409 si l'email existe) et [api/join:111](../app/api/join/route.ts#L111) (utilisateur connecté, mais indexé sur `invitation_code` 8 caractères, pas sur `invite_link_token`).

**Aucun chemin « utilisateur authentifié + lien → membership ».** Un élève qui ouvre `/join/<token>`, clique « Continuer avec Google » et s'authentifie revient sur la page… qui lui réaffiche le formulaire de création de compte, lequel échoue en 409 sur son propre email Google.

Aggravant structurel : le middleware envoie tout `/join/*` non authentifié vers `/login` ([middleware.ts:58](../middleware.ts#L58)), `/signup` figure dans `PUBLIC_PATHS` ([middleware.ts:10](../middleware.ts#L10)) mais **la page n'existe pas**, et `/login` ne propose que Google. Le formulaire email/mdp de `/join/[token]` n'est donc **atteignable par personne**. Le seul chemin d'inscription réel est celui qui ne rattache pas à la classe.

---

### Thème 4 — Qualité du contenu (impact élève)

#### B8 · Le prof ne valide pas ce que l'élève verra — `M`

En curation, une question image passe par `FormulaRenderer` / `MoleculeRenderer` / `GeoMap` ([PendingCard.tsx:71-86](../app/accueil/curation/_components/PendingCard.tsx#L71)).

Côté élève, la route `start-quiz` ne sélectionne **ni `formula_mathml`, ni `molecule_smiles`, ni `geo_topojson_path`** ([start-quiz/route.ts:79](../app/api/student/assignments/[id]/start-quiz/route.ts#L79)) : l'élève reçoit `image_url` et le quiz affiche un `<img>` brut ([quiz/page.tsx:356-359](../app/accueil/devoirs/[id]/quiz/page.tsx#L356)).

Les deux vues sont donc **structurellement différentes**. Le prof valide un SMILES en texte ou un chemin topojson ; l'élève reçoit une image. Personne ne relit le rendu réel avant publication. Pour les cartes, le prof ne voit littéralement pas l'image sur laquelle porte la question (cf. B2).

#### SAIN · Les garde-fous qualité existent et sont sérieux

À ne pas casser : `needs_review` est piloté par un seuil de confiance modulé par type d'image ([image-questions.ts:362-364](../lib/generate-questions/image-questions.ts#L362)) et par une heuristique d'affinité matière ([lib/pdf/subject-affinity.ts](../lib/pdf/subject-affinity.ts)) qui force la revue quand une image paraît hors-domaine. Le prompt force des QCM à choix canoniques pour bloquer les hallucinations sur les types identification ([image-questions.ts:110](../lib/generate-questions/image-questions.ts#L110)). L'UI remonte le signal ([curation/page.tsx:241-245](../app/accueil/curation/page.tsx#L241)).

Le contenu IA **ne part pas brut** : il y a un seuil, un drapeau, et une validation prof obligatoire. La faiblesse n'est pas le garde-fou, c'est que le prof valide sur un rendu faux (B8).

---

### Thème 5 — Dette technique transverse

#### D5 · Les helpers du projet sont minoritaires — `L`

Mesuré sur 117 routes API :

| Pattern | Routes |
|---|---|
| `requireUser` / `requireTeacher` / `requireAdmin` | **21** |
| `auth.getUser()` réécrit à la main | **69** |
| `apiError` / `safeError` | **39** |
| `NextResponse.json({ error … })` manuel | **69** |

Les helpers ([lib/api/auth.ts](../lib/api/auth.ts), [lib/api/respond.ts](../lib/api/respond.ts)) sont corrects et bien conçus — ils sont simplement arrivés après les deux tiers du code. Chaque route manuelle est une occasion de diverger sur un code de statut, un message d'erreur qui fuit du schéma, ou un check d'auth oublié. `CLAUDE.md` impose ces helpers (règles 1, 4, 6) : la règle existe, la base ne la suit pas.

Même constat sur `safeNextPath` ([lib/auth/safe-redirect.ts](../lib/auth/safe-redirect.ts)), écrit pour corriger un open redirect : il n'est utilisé que dans 3 routes API, alors que `next.startsWith("/")` subsiste à la main sur le chemin d'auth le plus fréquenté — [callback/route.ts:111](../app/auth/callback/route.ts#L111), [LoginClient.tsx:15](../app/login/LoginClient.tsx#L15), [OnboardingNameClient.tsx:39](../app/onboarding/name/OnboardingNameClient.tsx#L39). `//evil.com` y passe.

#### D6 · Code mort applicatif — `M`

Sans aucun importeur : `StarSelector`, `DraftCard`, `PdfUploadZone`, `ContextualQuestionCard`, `PageHeader`, `TabBar`, `StudyWizard`, `LandingCTA`, `QuestionFlowModal`, `StudentClassCard`, `LivePdfViewer`, `MasteryProgressBar`, `MicPermissionRecoveryModal`, `PairingCodeDisplay`, `AttendanceRow`, `SessionRecapHero`, `WeeklyStatsBanner`, `LiveSessionTimer`, `StudentPickBadge`, `ZoomControls`, `UnsupportedBrowserNotice`, `CourseProgressCard`, `EvaluationButtons`, `LoadingSkeleton` — plus `lib/student-subjects.ts`, `lib/live-session-utils.ts`, `lib/ingestion/chunk-by-uaa.ts`.

Cas à traiter en priorité : [`lib/supabase.ts`](../lib/supabase.ts) exporte un client Supabase anon **global au module**, sans appelant. C'est un pattern dangereux laissé à disposition : le premier import le réintroduit hors du modèle SSR (`lib/supabase-server` / `supabase-browser`) et contourne la gestion de session.

#### D7 · Zéro test sur les routes API — `L`

288 assertions, réparties sur 29 fichiers `tests/lib/*` (logique pure : PIN, rôles, dates, prompts, heatmap, extraction PDF, `safeNextPath`…) et 2 specs e2e (`accueil-dispatch`, `multi-tenant-isolation`).

**Aucune route API n'est testée.** Les invariants les plus coûteux du produit — double-gate de validation, cascade de suppression, idempotence du join, gates d'invitation, propriété d'une classe — ne sont couverts que par de la relecture. La couverture est bonne là où le risque est faible, et nulle là où il est élevé.

---

### Thème 6 — Friction UX prof

**Réponse à la question posée : non.** Un prof non technique ne peut pas mener « importer un cours → valider → assigner » seul, sans documentation. Il est arrêté trois fois : à la fin de l'import (renvoi vers Supabase Studio, B4), à la validation (double-gate silencieux, B5), à l'assignation (compteur mensonger, F2). Aucun de ces trois murs n'émet de message d'erreur exploitable.

| ID | Friction | Réf | Effort |
|---|---|---|---|
| F1 | « Rejoindre une session élève » pointe vers `/join` (rejoindre une **classe** par code), pas vers `/accueil/live` | [session/nouvelle/page.tsx:308](../app/accueil/session/nouvelle/page.tsx#L308) | S |
| F2 | Le sélecteur de cours compte toutes les questions, pas les assignables → le prof choisit un cours et prend un 400 | [courses/route.ts:85-90](../app/api/courses/route.ts#L85) | S |
| F3 | Question créée à la main : ni `course_id` ni `validated_at` → inassignable à vie, mais affichée comme validée | [useQuestionsPage.ts:237-255](../app/accueil/curation/_hooks/useQuestionsPage.ts#L237) et [604-608](../app/accueil/curation/_hooks/useQuestionsPage.ts#L604) | S |
| F4 | Pas d'action de masse : 200 questions importées = 200 clics | — | M |
| F5 | Vocabulaire éclaté : nav « Curation », page « Mes questions », action « valider » | — | S |
| F6 | `/signup` déclaré public mais la page n'existe pas | [middleware.ts:10](../middleware.ts#L10) | S |

---

## Top 10 priorisé

| # | Finding | Pourquoi en premier | Effort |
|---|---|---|---|
| 1 | **B1** — cascade de suppression de classe | Seul finding à perte de données irréversible. Chaque jour d'exposition est un risque net, et Adrien est en conditions réelles | L |
| 2 | **D3** — supprimer `image-proxy` | Trou SSRF non authentifié, zéro appelant : suppression, pas de correctif. Meilleur ratio risque/effort du rapport | S |
| 3 | **B5** — double-gate de validation | Bloque le parcours nominal du beta-testeur. La direction technique est déjà écrite dans le code | M |
| 4 | **B2** — GeoMap masque l'image | Rend du contenu payé invalidable, et fait passer le prof pour fautif | S |
| 5 | **B3** — filtre « période » fossile | Un filtre qui renvoie toujours zéro détruit la confiance dans toute l'UI de curation | S |
| 6 | **B4** — « vérifie en base via Supabase Studio » | Un prof ne doit jamais lire ça. Correction triviale, impact de crédibilité immédiat | S |
| 7 | **B7** — inscription par lien + SSO | Bloque l'acquisition : chaque élève invité échoue à rejoindre sa classe | M |
| 8 | **B8** — le prof ne valide pas ce que l'élève verra | Fait porter au prof la responsabilité d'un contenu qu'il n'a pas pu juger | M |
| 9 | **D7** — tests sur les routes critiques | Sans filet sur les invariants ci-dessus, chaque correctif du top 8 peut en réintroduire un autre | L |
| 10 | **B6** — exercices assignables (ou retrait du dashboard) | Le plus gros investissement non livré du repo. Trancher : brancher, ou cesser de le compter | L |

**Séquencement.** Les items 2, 4, 5, 6 sont tous en `S` et indépendants : ils tiennent dans une journée et rendent l'UI de curation présentable avant tout autre chantier. L'item 1 mérite une migration dédiée et sa propre revue. L'item 9 devrait démarrer *avant* 7, 8 et 10, pas après.

---

## Ce qui est sain — à ne pas toucher

- **`app/api/consent/sign/route.ts`** — la meilleure route du repo. Publique par nécessité (le parent n'est pas utilisateur), token haché en SHA-256, nom du signataire en bcrypt, IP hachée, et réponse volontairement indifférenciée entre « inconnu », « expiré » et « déjà signé » pour ne pas créer d'oracle. Le raisonnement de sécurité est écrit dans le fichier. À prendre comme modèle.
- **Les garde-fous qualité du pipeline** — `needs_review` + `subject-affinity` + prompt à choix canoniques. Conception réfléchie, commentée, avec un vrai raisonnement sur les faux négatifs.
- **`lib/api/auth.ts` et `lib/api/respond.ts`** — helpers corrects et bien dimensionnés. Le problème n'est pas leur qualité, c'est leur taux d'adoption.
- **Le modèle `class_memberships`** — `UNIQUE (class_id, student_user_id)` + `CHECK status IN ('active','removed')` : l'intention never-DELETE est correctement encodée dans le schéma. C'est la cascade venue d'ailleurs qui la contourne (B1).
- **Le nettoyage HistoGuess de fond** — `20260509160000_drop_legacy_histoguess.sql` a réellement supprimé les tables du jeu. Il ne reste plus qu'un système de questions.
- **`safeNextPath`** — helper correct, documenté par le cas d'attaque qu'il ferme. À généraliser, pas à réécrire.
- **Les 288 tests unitaires** — solides sur la logique pure (PIN, rôles, dates, extraction). La couverture est à étendre, pas à refondre.
- **Les migrations récentes** — `SECURITY DEFINER` + `SET search_path = ''`, `CHECK` sur les colonnes enum, `ON DELETE` explicites. Les règles 8-12 sont respectées dans le code récent : la discipline existe, elle est simplement postérieure au socle.

---

*Audit read-only. Aucun fichier modifié hors ce rapport, aucune écriture en base, aucun test d'écriture exécuté.*
