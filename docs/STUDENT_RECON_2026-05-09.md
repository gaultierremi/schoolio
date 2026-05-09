# Student-Side Recon — Schoolio
_Date : 2026-05-09 · Branche : main · Auteur : recon automatisé pré-sprint Piste A_

---

## 1. Pages élève existantes

### `/student` — Dashboard élève
- **Composants** : `StudentDashboardClient`, `AssignmentCard`, `ClassCard` (inline)
- **Ce que l'élève voit** : liste de ses classes (nom, prof, matière, niveau), onglets "À faire" / "Fait" sur ses devoirs, statut + score + date limite de chaque devoir.
- **État UX** : **fonctionnel mais inégal** — architecture propre, dark theme cohérent, mais visuellement sec. Aucune donnée de progression ou de maîtrise visible ici. L'élève voit son « to-do list » de devoirs, pas sa progression.
- **Loading / Error / Empty** : ✓ / ✓ / ✓ (tous présents)
- **Mobile** : oui (`px-4`, `sm:grid-cols-2`)

### `/student/assignments/[id]` — Détail devoir
- **Composants** : `StudentAssignmentPage` (client)
- **Ce que l'élève voit** : titre, description, date limite (rouge si en retard), statut (pending/in_progress/completed), score %, nb de tentatives. Action : lancer quiz ou marquer PDF lu.
- **État UX** : **fonctionnel mais moche** — badges de statut corrects mais pas animés, typography basique. Pas de concept tracking, pas de SM-2.
- **Loading / Error / Empty** : ✓ / ✓ (404) / n.a.
- **Mobile** : oui (`max-w-xl`, single column)

### `/student/assignments/[id]/quiz` — Quiz devoir
- **Composants** : `AssignmentQuizPage` (client)
- **Ce que l'élève voit** : 1 question à la fois avec barre de progression, timer, feedback immédiat (vert/rouge), score final avec emoji motivationnel.
- **État UX** : **poli** — bonne UX quiz, transitions nettes, timer. ⚠️ Version simplifiée de `TrainingCard` : pas de typewriter, pas de tracking concept, pas de points. C'est un quiz de notation, pas d'apprentissage adaptatif.
- **Loading / Error / Empty** : ✓ / ✓ (retry) / n.a.
- **Mobile** : oui (`max-w-lg`, touch-friendly)

### `/train` — Entraînement adaptatif
- **Composants** : `TrainPage` (server) → `TrainingCard` (client, très riche)
- **Ce que l'élève voit** : quiz adaptatif (3 modes : Cash 300pts / Carré 200pts / Duo 100pts), feedback concept en temps réel, milestones de maîtrise avec confettis à 80/100, score de maîtrise par concept.
- **État UX** : **poli** — `TrainingCard` est le composant le plus avancé côté élève. Typewriter effect, barres de progression concept, résultats détaillés. L'empty state (premier visit, aucun historique) est sobre mais clair.
- **Loading / Error / Empty** : ✓ / partiel (erreurs silencieuses dans la lib) / ✓
- **Mobile** : oui

### `/study` — Lancer une session d'étude
- **Composants** : `StudyWizard` (4 étapes : matière → source → config → preview)
- **Ce que l'élève voit** : wizard multi-étapes pour créer une session personnalisée (bibliothèque / banque perso / PDF / topic IA / questions manuelles), config du nb de questions, difficulté, mode adaptatif.
- **État UX** : **poli** — wizard propre, step indicators, édition inline des questions en preview, gestion d'erreur.
- **Loading / Error / Empty** : ✓ / ✓ / n.a.
- **Mobile** : oui

### `/study/session` — Session en cours
- **Composants** : `StudySessionPage` → `TrainingCard`
- **Ce que l'élève voit** : quiz lancé depuis le wizard (via sessionStorage), enrichissement concept asynchrone, recommandations IA après session (révision / progression / défi).
- **État UX** : **poli** — chargement progressif propre, recommandations colorées par type. Dépendance à sessionStorage (⚠️ casse si refresh page).
- **Loading / Error / Empty** : ✓ / ✓ / ✓
- **Mobile** : oui

### `/study/review` — Révision espacée
- **Composants** : `ReviewCard`
- **Ce que l'élève voit** : questions dues aujourd'hui (SM-2), feedback après chaque réponse avec **date de prochaine révision visible**, résumé final.
- **État UX** : **poli** — c'est la seule page où l'élève voit explicitement les données SM-2.
- **Loading / Error / Empty** : ✓ / ✓ / ✓ (✅ "Tout est à jour !")
- **Mobile** : oui

### `/study/stats` — Statistiques d'apprentissage
- **Composants** : page server-side uniquement (pas de composants client)
- **Ce que l'élève voit** : 4 cartes (sessions / réponses / maîtrisés / taux réussite), barres de maîtrise par matière colorées, liste des sessions récentes, concepts faibles (top 8).
- **État UX** : **très poli** — la page la plus visuellement soignée côté élève. Données riches, bonne hiérarchie visuelle.
- **Loading / Error / Empty** : n.a. / ✓ / ✓ (📊 "Pas encore de données")
- **Mobile** : oui (`sm:grid-cols-4`)

### `/profile` — Profil & gamification
- **Composants** : `ProfileEditor`, `MasteryDashboard`
- **Ce que l'élève voit** : avatar (couleur + skin), pseudo/prénom, streak 🔥, badges débloqués (first_game / streak_3 / streak_7 / quiz_expert…), collection de skins avec conditions de déblocage, mastery dashboard par concept (barres rouge/orange/vert + date prochaine révision).
- **État UX** : **bon** — `ProfileEditor` est soigné. ⚠️ Thème CLAIR (fond blanc) alors que tout le reste du site est dark — incohérence visuelle frappante.
- **Loading / Error / Empty** : ✓ / ✓ / ✓
- **Mobile** : oui

### `/join` et `/join/[token]` — Rejoindre une classe
- **Composants** : `JoinPage`, `JoinTokenClient`, `JoinClassForm`
- **Ce que l'élève voit** : saisie code 6 chars (auto-uppercase, monospace), puis formulaire adapté au mode auth (light = pseudo seulement / full = email+password).
- **État UX** : **très poli** — meilleure UX de formulaire du projet. Validation en temps réel, aria-invalid, messages d'erreur clairs, champs typés.
- **Loading / Error / Empty** : ✓ / ✓ / n.a.
- **Mobile** : oui (`max-w-sm`)

---

## 2. Routes API élève

| Route | Méthodes | Rôle | Utilisée par | Orpheline ? |
|-------|----------|------|--------------|-------------|
| `/api/student/my-classes` | GET | Classes actives de l'élève | `StudentDashboardClient` | Non |
| `/api/student/assignments` | GET | Devoirs de l'élève (toutes classes) | `StudentAssignmentPage`, dashboard | Non |
| `/api/student/assignments/[id]/start-quiz` | POST | Init quiz devoir, passe en_progress | `/quiz page` | Non |
| `/api/student/assignments/[id]/finish-quiz` | POST | Save score (keep best), durée | `/quiz page` | Non |
| `/api/student/assignments/[id]/mark-read` | POST | Marque PDF lu → completed | `/[id] page` | Non |
| `/api/student/assignments/[id]/pdf-url` | GET | URL signée PDF (TTL 1h) | `/[id] page` | Non |
| `/api/student/classes/[id]/leave` | POST | Status → "removed" | `StudentDashboardClient` | Non |
| `/api/adaptive-questions` | GET | Questions adaptatives selon maîtrise | `TrainPage` | Non |
| `/api/record-quiz-answer` | POST | Met à jour la maîtrise concept | `TrainingCard` | Non |
| `/api/spaced-repetition` | POST | SM-2 : calcule next_review, EF, mastery | `ReviewCard` | Non |
| `/api/study-session` | POST | Crée un enregistrement de session | `StudySessionPage` | Non |
| `/api/study-recommendations` | GET/POST | Recommandations IA post-session | `StudySessionPage` | ⚠️ À vérifier |
| `/api/generate-explanation` | POST | Génère explication IA (form prof) | `QuestionForm` côté PROF | ⚠️ Pas côté élève |
| `/api/propose-question` | POST | Propose question au site public | Page questions PROF | Non — côté prof uniquement |

**Routes potentiellement orphelines :** `/api/study-recommendations` — logique présente mais consommation côté client à confirmer. `/api/generate-explanation` est purement côté prof.

---

## 3. Composants élève

| Composant | Chemin | Rôle | UX |
|-----------|--------|------|-----|
| `JoinClassForm` | `components/classes/JoinClassForm.tsx` | Formulaire join light/full | Très poli |
| `StudentClassCard` | `components/classes/StudentClassCard.tsx` | Card de classe sur dashboard | Poli |
| `TrainingCard` | `components/TrainingCard.tsx` | Quiz adaptatif avec concept tracking | Très poli |
| `ReviewCard` | `components/ReviewCard.tsx` | Quiz SM-2 avec next_review visible | Poli |
| `StudyWizard` | `components/StudyWizard.tsx` | Wizard 4 étapes création session | Poli |
| `MasteryDashboard` | `components/MasteryDashboard.tsx` | Barres maîtrise par concept | Poli |
| `ProfileEditor` | `components/ProfileEditor.tsx` | Avatar, badges, skins, streak | Poli |
| `StudentDashboardClient` | `app/student/StudentDashboardClient.tsx` | Dashboard principal élève | Fonctionnel |

---

## 4. SM-2 et entraînement adaptatif

**Où vit la logique SM-2 :**
- `app/api/spaced-repetition/route.ts` — algorithme complet : intervalles 1/3/7/14 jours, EF (±0.15/±0.2), mastery score ±5/−8, clamped 0-100, accélération si réponse rapide (<5s)
- `lib/concepts.ts` — `updateConceptMastery()` : calcule next_review en fonction du mastery_score
- `lib/adaptive.ts` — `getAdaptiveQuestions()` : sélection 60% weak / 30% medium / 10% strong

**Quelle UI consomme SM-2 :**
- `ReviewCard` → `/api/spaced-repetition` (SM-2 pur, montre la date de prochaine révision)
- `TrainingCard` → `/api/record-quiz-answer` → `updateConceptMastery()` (SM-2 indirect via maîtrise concept)
- `/study/stats` → affiche mastery_score par concept (résultat de SM-2)
- `MasteryDashboard` → montre mastery_score + flag "à revoir" si next_review <= now()

**Élèves, profs, ou les deux :** uniquement élèves (les profs ont leur propre flow de validation/proposition).

**Stats SM-2 visibles à l'élève :**
- ✓ Date de prochaine révision (dans `ReviewCard` après chaque réponse)
- ✓ Mastery score 0-100 par concept (`/study/stats`, `MasteryDashboard`)
- ✓ "À revoir" badge (rouge) si next_review dépassée (`MasteryDashboard`)
- ✗ Intervalle actuel (nb de jours) non visible
- ✗ EF (ease factor) non exposé (normal, interne)

---

## 5. Onboarding élève

**Flow actuel :**
1. Prof crée une classe → génère un code 6 chars ET/OU un lien `/join/[token]`
2. Élève va sur `/join` → saisit le code → redirigé vers `/join/[token]`
3. Selon le mode auth de la classe : formulaire light (pseudo + prénom) OU full (email + password)
4. Account créé → redirigé vers `/student`

**Le flow `/join/[token]` est-il fonctionnel ?** Oui — code complet, validation, deux modes auth, gestion des tokens invalides/expirés.

**Y a-t-il un onboarding "bienvenue" ?** **Non.** Après inscription, l'élève atterrit directement sur `/student` avec sa classe déjà visible. Pas de step "voici ce que tu peux faire", pas de tutorial, pas de premier quiz guidé.

**Comptes light vs full :** Les comptes light génèrent un email synthétique (`pseudo@schoolio.app` ou similaire) pour s'insérer dans le système Supabase auth. La distinction est transparente pour l'élève mais les comptes light ont des contraintes (pas de récupération password, etc.).

---

## 6. Devoirs côté élève

| Fonctionnalité | Présent ? | Notes |
|----------------|-----------|-------|
| Voir liste des devoirs | ✓ | Dashboard + onglets À faire/Fait |
| Faire un quiz devoir | ✓ | `/quiz page`, score sauvegardé (best score preserved) |
| Faire un devoir EXERCICE guidé | **✗ ABSENT** | Infra back-end existe (tables exercises/exercise_steps), UI élève inexistante |
| Voir son score | ✓ | % affiché + nb tentatives |
| Voir les devoirs en retard | ✓ | Badge rouge "En retard", date en rouge |
| Accès PDF devoir | ✓ | URL signée, "marquer comme lu" |
| Tracking concept sur quiz devoir | **✗** | Le quiz devoir n'appelle pas `record-quiz-answer`, pas de SM-2 |

**⚠️ Confirmation audit :** L'UI élève pour exercices guidés est **totalement absente**. Les exercises côté prof (création/validation) existent dans `/school/courses/[id]/exercises/` mais aucune route, aucune page, aucun composant n'expose cela aux élèves.

---

## 7. Stats / Progression / Gamification élève

| Élément | Visible ? | Où |
|---------|-----------|-----|
| Progression par matière | ✓ | `/study/stats` (barres colorées) |
| Streak quotidien | ✓ partiel | Affiché sur `/profile` uniquement (🔥 Xj). Absent du dashboard. |
| Badges | ✓ | `ProfileEditor` (first_game, streak_3/7, quiz_expert, founder…) |
| Skins / cosmétiques | ✓ | `ProfileEditor`, unlock par conditions |
| Titres | ✓ | `ProfileEditor` (rarity levels) |
| Points de session | ✓ | `TrainingCard` (Cash/Carré/Duo) — mais non cumulés nulle part |
| Niveau global | ✗ | Champ `level` dans `user_profiles` mais non affiché |
| Leaderboard classe | **✗** | Lien `/scoreboard` dans `profile/page.tsx` mène à une **page inexistante** (404) |
| Stats par concept (mastery) | ✓ | `/study/stats`, `MasteryDashboard` |
| Comparaison avec les autres élèves | **✗** | Aucun leaderboard fonctionnel |

---

## 8. Comparaison visuelle prof vs élève

**Honnêteté franche :** `/school` (prof) est globalement mieux soigné que `/student`.

| Critère | `/school` (prof) | `/student` (élève) |
|---------|-----------------|-------------------|
| Thème | Dark cohérent | Dark cohérent SAUF `/profile` (fond blanc — rupture visuelle) |
| Composants UI réutilisés | Oui (`FilterBar`, `SubjectLevelSelector`…) | Partiellement — `TrainingCard`, `ReviewCard` sont propres |
| Richesse visuelle | Élevée (purple theme, gradients, animations) | Inégale : `/train` et `/study/stats` sont beaux, `/student` dashboard est sobre |
| Micro-interactions | Hover states, transitions partout | Présentes dans `TrainingCard` et `ReviewCard`, plus rares sur dashboard |
| Typographie | Cohérente (font-black, uppercase labels) | Cohérente sur les pages study, plus basique sur student |
| Empty states | Travaillés (icônes, textes contextuels) | Corrects mais moins soignés |
| Dashboard principal | `/school` : stats visuelles, navigation claire | `/student` : liste de devoirs, pas de "vue d'ensemble" apprenante |

**Verdict :** `/school` est "nickel". `/student` dashboard est fonctionnel mais sec. Les pages `/study/*` et `/train` rattrapent le niveau prof. Le vrai écart : l'élève n'a pas de "homebase" visuellement engageante.

---

## 9. Top 5 priorités UX élève

- **Priorité 1 : Dashboard élève enrichi** — `/student` est un to-do list de devoirs, l'élève ne voit jamais sa progression globale ni son streak depuis sa page d'accueil.
- **Priorité 2 : Connecter quiz devoirs → SM-2** — Le quiz devoir (`/assignments/[id]/quiz`) ne déclenche pas `record-quiz-answer`, donc les devoirs ne nourrissent pas la maîtrise concept. Double effet : l'élève perd du feedback et le système perd des données.
- **Priorité 3 : Onboarding post-inscription** — Aucun "bienvenue", aucun tutorial. Un élève qui s'inscrit via token atterrit sur son dashboard sans savoir que `/train` ou `/study` existent.
- **Priorité 4 : UI exercices guidés (student-side)** — L'infra back-end des exercices multi-étapes existe mais est invisible aux élèves. C'est le seul type de devoir non implémenté côté élève.
- **Priorité 5 : Leaderboard classe fonctionnel** — Le lien `/scoreboard` sur la page profil renvoie un 404. La compétition saine est un levier de rétention fort pour des élèves.

---

## 10. Surprises et alertes

**Bugs visibles :**
- `/scoreboard` lien mort (404) depuis `profile/page.tsx` — visible de l'élève.
- `/study/session` utilise `sessionStorage` pour transmettre la session au composant → casse si l'élève rafraîchit la page en cours de session (affiche "session introuvable").

**Régressions potentielles :**
- `getAdaptiveTimelineEvents()` supprimé dans le sprint dette technique (Chantier 2). Si `TrainPage` ou un autre composant l'importait, vérifier (tsc passait — bon signe, mais à surveiller en runtime).

**Incohérences :**
- `/profile` est en thème clair (fond blanc) → rupture visuelle totale avec les pages dark.
- Le quiz devoir (`/quiz`) et `TrainingCard` (`/train`) sont deux interfaces quiz distinctes, non partagées, avec des niveaux de polish différents. L'élève peut avoir l'impression d'utiliser deux produits différents.
- Points de session (`TrainingCard` : Cash/Carré/Duo) ne sont cumulés nulle part — le système de points est affiché mais ne mène à rien de persistant.
- Badge `timeline_master` référencé dans `ProfileEditor` mais la feature "timeline" (duel anachronisme) a été supprimée dans le sprint dette technique. Le badge devient unachievable.

**Sécurité :**
- Aucun problème apparent côté API : vérifications de membership correctes sur toutes les routes student. Les PDFs sont servis via URLs signées avec TTL 1h. RLS Supabase à vérifier côté migrations pour `teacher_questions` (audit précédent signalait `courses` sans RLS — non vérifié en détail ici).
