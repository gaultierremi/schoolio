# Audit Flow Élève — Post A1 — 2026-05-09 v2

**Base :** main @ 481d591 (post-merge Sprint UX élève A1)  
**Méthode :** analyse statique complète du code source (pas de browser disponible en CI)  
**Périmètre :** tout le flow élève — join, dashboard, devoirs, quiz, /train, /study/*, /profile  

---

## 1. Setup

- Compte de test élève : non créé en live (analyse statique uniquement)
- Deux modes d'authentification élève existants : **light** (pseudo) · **full** (email/password)
- Les redirect URLs après join-light et join-full retournent toutes les deux `/student` (pas `?welcome=1`)
- Le modal onboarding s'affiche quand même : `student_onboarding_dismissed_at IS NULL` pour tout nouveau compte ✅

---

## 2. Flow inscription / onboarding

### /join (saisie code)
- ✅ Design dark cohérent, validation 6 chars, uppercase auto
- ✅ Messages d'erreur inline ("Code invalide")
- 🟡 Pas de lien "Créer un compte" pour un parent/élève perdu sans code — dead end

### /join/[token] (création compte)
- ✅ JoinClassForm adapté au mode light (pseudo) ou full (email/mdp)
- ✅ Reconnexion light-mode : magic link ré-utilisé silencieusement ✅
- ⚠️ Light mode : le nom affiché sur le dashboard sera le `pseudo`, mais les champs firstName/lastName sont collectés — ils n'apparaissent nulle part dans le flow élève post-login sauf dans StreakHeroCard (ligne "Connecté en tant que…" en `text-gray-600`, quasi invisible)
- 🟡 Redirect après join : `/student` (pas `/student?welcome=1`) — onboarding modal OK grâce au null check, mais le param `?welcome=1` n'est jamais produit par le join flow. Dead code partiel.

### Modal onboarding (StudentWelcomeOnboarding)
- ✅ 3 étapes, dots de progression, Escape/backdrop dismiss
- ✅ Dismiss → POST `/api/student/dismiss-onboarding` → met à jour `student_onboarding_dismissed_at`
- ✅ "Revoir le tutoriel" sur /profile → `/student?welcome=1` → re-déclenche modal ✅
- ⚠️ `useEffect` sans tableau de dépendances → re-register du keydown listener à chaque render (pas bloquant mais inutilement coûteux)
- ⚠️ Si l'appel API dismiss échoue silencieusement (réseau), le modal se ferme côté client mais réapparaît au prochain chargement. Acceptable.
- 🟡 Aucune animation de transition entre étapes — abrupt pour un onboarding

---

## 3. Dashboard /student

### StreakHeroCard
- ✅ Badge 🔥 conditionnel (`streak > 0`) — correct empty state implicite
- ✅ SignOutButton extrait en client component
- ⚠️ Le pseudo et "Connecté en tant que…" sont affichés en `text-gray-600` (très foncé sur fond gray-950) — lisibilité très faible

### DailyStudyCard
- ✅ 2 états : "À jour" (vert) et "Questions dues" (violet)
- ❌ **Trompe-l'œil** : un élève tout neuf qui n'a jamais étudié voit "✅ Tu es à jour pour aujourd'hui !" — faux. Il n'a aucune donnée, il n'est pas "à jour". Message inadapté pour un premier accès.
- 🟡 Retourne `null` en cas d'erreur DB — le slot disparaît sans message, créant un trou dans la mise en page

### MasterySubjectGrid
- ✅ Caché si `subjectMastery.length === 0` — évite un crash
- ❌ **Pas d'empty state** : un élève sans données de maîtrise voit juste un vide entre DailyStudyCard et la section devoirs. Aucun appel à l'action, aucune explication. Inquiétant lors d'une démo.

### Section devoirs
- ✅ Tabs "À faire / Fait" avec compteurs
- ✅ Empty state par tab ("Aucun devoir en attente. Bien joué !")
- ❌ **Section entière masquée** si `assignments.length === 0` : un élève sans devoirs voit un dashboard fragmenté (hero → join CTA → daily card → [rien] → explorer). Pas de "Aucun devoir pour l'instant" d'encouragement.

### ExplorerFooter
- ✅ 3 liens (Entraînement /train · Révision /study/review · Statistiques /study/stats)
- ✅ Design cohérent dark
- 🟡 Les 3 liens sont fonctionnels mais non-contextuels pour un nouvel élève sans données

---

## 4. Devoirs

### Liste (via dashboard)
- ✅ Tri par status (pending → in_progress → completed) côté serveur ✅
- 🟡 Pas de pagination — si un élève a 50 devoirs, tout est chargé d'un coup

### Page détail `/student/assignments/[id]`
- ❌ **Fetch de tous les devoirs pour trouver 1** : le client appelle `GET /api/student/assignments` (retourne toute la liste) puis fait un `.find()` par ID. O(n) pour une page qui ne devrait charger qu'1 ressource. Pas de route dédiée `GET /api/student/assignments/[id]`.
- ✅ Dark theme cohérent, statut badge, date retard en rouge
- ✅ Empty state "Devoir introuvable" ✅

#### Devoir PDF
- ✅ Bouton "Voir le cours" → fetch signed URL → `window.open`
- ⚠️ **"J'ai lu" conditionnel sur l'état client** : le bouton n'apparaît que si `pdfUrl !== null` (après avoir cliqué "Voir le cours"). Si l'élève actualise la page après avoir lu, `pdfUrl` redevient null et il doit re-cliquer "Voir le cours" avant de voir "J'ai lu". Friction inutile.
- ✅ Statut "Lu" avec date après mark-read ✅

#### Devoir Quiz
- ✅ Lancement, timer, shuffle des questions
- ✅ Feedback couleur immédiat (vert/rouge) après réponse
- ❌ **BUG CRITIQUE — Score gonflé si dernière réponse correcte** : voir section §8

#### Devoir type "exercise"
- ❌ **BLOQUER complet** : `resource_type` non "pdf" non "quiz" → aucun bouton d'action rendu. Si un prof assigne un exercice guidé de cours, l'élève voit le titre, la classe, la date — mais zéro bouton. Page morte.
- La page TypeScript type `resource_type: "pdf" | "quiz"` — indique que le cas "exercise" n'a jamais été anticipé côté élève.

---

## 5. Entraînement libre /train

- ✅ Empty state propre pour élève sans données (`hasData = false`) avec CTA vers /study
- ✅ Concepts faibles affichés en badges orange
- ⚠️ **Back button → "/" et non "/student"** : le bouton "← Accueil" renvoie à la home générique, pas au dashboard élève. L'élève doit naviguer depuis la home pour retrouver son espace.
- 🟡 Le mode adaptatif nécessite d'avoir fait au moins une session — pas d'explication à l'élève sur comment "démarrer" l'adaptatif autrement qu'en allant sur /study

---

## 6. Étude /study

### /study (StudyWizard)
- ✅ Sélecteur de matière + config session + preview
- ✅ **C4 fix confirmé** : `localStorage.setItem("study_session", ...)` — résiste au refresh ✅
- 🟡 Header générique (logo + avatar + "Se déconnecter") — pas de retour vers /student
- 🟡 Le Header utilise Google OAuth "Se connecter" même pour les élèves light-mode connectés. Pour eux, l'avatar se charge OK mais le bouton est confusant.

### /study/session (après StudyWizard → localStorage)
- ✅ **C4 fix** : lecture via `localStorage.getItem("study_session")` ✅
- ✅ "Introuvable" si localStorage vide → message d'erreur ✅

### /study/review
- ✅ Empty state "✅ Tout est à jour !" avec 2 CTA ✅
- ✅ Affiche le nb de questions dues ✅
- 🟡 `<Header>` idem — pas de lien vers /student pour l'élève

### /study/stats
- ✅ Empty state propre (📊) avec CTA "Commencer à étudier" ✅
- ✅ Breakdown par matière, sessions récentes ✅
- 🟡 `<Header>` idem — "← Retour" va vers /study, pas /student

---

## 7. Profil /profile

- ✅ **Dark theme post-A1** : bg-gray-950, text-white, cartes bg-gray-900 ✅
- ✅ **Lien /scoreboard supprimé** ✅
- ✅ **"Revoir le tutoriel"** visible uniquement si `role === "student"` ✅
- ✅ **MasteryDashboard** dark : bg-gray-900, badges amber-900/30, sections vert/rouge foncées ✅
- ⚠️ Back button "← Accueil" → "/" (home générique) pas "/student"
- 🟡 ProfileEditor non audité (composant lourd) — à vérifier manuellement pour dark theme cohérence

---

## 8. Bugs critiques

### ❌ BUG #1 — CRITIQUE SHOWCASE : Score quiz > 100% si dernière réponse correcte

**Fichier :** `app/student/assignments/[id]/quiz/page.tsx`, `handleNext()`  
**Code fautif :**
```js
const score = Math.round(
  ((correctCount + (selected === questions[current].answer_index ? 1 : 0))
    / questions.length) * 100
);
```
**Cause :** quand `handleNext` s'exécute sur la dernière question, `correctCount` est déjà à jour (la re-render après `handleSelect` a appliqué le `setCorrectCount(c => c+1)`). Le développeur a ajouté `+1` conditionnel pensant que l'état ne serait pas encore mis à jour — double-comptage.  
**Effet :** si la dernière question est correcte, score = `(n+1)/n * 100` → ex. 10 questions toutes bonnes → score affiché = **110%**.  
**Conséquence chaîne :** le score est envoyé à `finish-quiz`, qui valide `score > 100 → 400 "Score invalide"`. Le `fetch` échoue silencieusement (pas de catch dans `submitResult`). L'assignment reste en status **"in_progress"** même après que l'élève a tout répondu correctement.  
**Fréquence :** ~50% des tentatives (quand la dernière réponse est juste).

### ❌ BUG #2 — Devoir type "exercise" : page morte sans bouton d'action

**Fichier :** `app/student/assignments/[id]/page.tsx`  
**Cause :** seuls `resource_type === "pdf"` et `resource_type === "quiz"` ont un bloc JSX. Tout autre type (ex. "exercise") rend un header + statut mais **aucun bouton**.  
**Fréquence :** dès qu'un prof assigne un exercice guidé.

### ❌ BUG #3 — "Tu es à jour !" pour un élève sans données

**Fichier :** `components/DailyStudyCard.tsx`  
**Cause :** `getDailyStudyPlan` retourne `dueCount=0, newCount=0` pour un compte vierge → `!hasAny = true` → affiche le badge vert "à jour".  
**Effet :** le nouvel élève voit un faux message positif dès sa première connexion.

### ⚠️ BUG #4 — Dead code : "Nouveau meilleur score !" jamais affiché

**Fichier :** `app/student/assignments/[id]/quiz/page.tsx`, ligne ~148  
```js
{finalScore > (finalScore) ? "Nouveau meilleur score !" : "Le meilleur score est conservé."}
```
`finalScore > finalScore` est toujours `false`. "Le meilleur score est conservé." s'affiche même au premier essai.

---

## 9. Incohérences UX

- **Navigation retour incohérente** : /train → "← Accueil" (→ `/`), /profile → "← Accueil" (→ `/`), /study/* → Header logo (→ `/`). Aucune page secondaire ne renvoie directement à `/student`.
- **Header générique sur /study/*** : le `<Header>` montre logo + avatar + "Se déconnecter". Pas de mention /student. L'élève ne sait pas comment revenir à son espace.
- **Pseudo light-mode illisible** dans StreakHeroCard : "Connecté en tant que Jean (pseudo : jojo)" en `text-gray-600` sur `bg-gray-950` — contraste WCAG fail.
- **Assignments hidden à zéro** : section devoirs absente si `assignments.length === 0`. L'élève voit un vide inexpliqué.
- **MasterySubjectGrid absent à zéro** : idem — vide sans message d'encouragement à étudier.
- **Spacing dashboard** : l'enchaînement hero → join CTA → daily card → (rien si pas de mastery) → (rien si pas de devoirs) → explorer footer peut produire un layout très court et vide.
- **Tutoiement cohérent** ✅ (tu/te/ton partout, vérifié sur toutes les pages élève).
- **Dark/light mélange** : les pages `/study/*` et `/train` utilisent `<Header>` avec `bg-gray-900 border-gray-800` — cohérent. Profile ✅. Tout le flow élève reste dark ✅.

---

## 10. Top 5 priorités SHOWCASE-READINESS

**Priorité 1 : Corriger le bug de score quiz (BUG #1)**  
Pourquoi urgent : un directeur d'école qui fait le demo quiz voit "110%" ou son devoir reste "En cours" après l'avoir complété. Blocage total de la démo.  
Effort : ~30 min. Fix = supprimer `(selected === questions[current].answer_index ? 1 : 0)` de la formule, utiliser `correctCount` seul.

**Priorité 2 : Empty state assignments + mastery sur dashboard vierge**  
Pourquoi urgent : un compte de demo fraîchement créé affiche un dashboard avec 3 sections vides et "Tu es à jour" trompeur. Premier écran qui doit convaincre.  
Effort : ~1h. Ajouter placeholder text dans les zones vides, corriger le message DailyStudyCard pour nouveaux comptes.

**Priorité 3 : Navigation retour vers /student depuis /train, /study/*, /profile**  
Pourquoi urgent : lors d'une démo, naviguer vers /train et ne plus savoir comment revenir au dashboard élève est désorientant.  
Effort : ~45 min. Remplacer "← Accueil" par "← Mon espace" → `/student` sur toutes les pages secondaires élève.

**Priorité 4 : Handler "exercise" dans la page devoir**  
Pourquoi urgent : si le prof de démo a créé un cours avec des exercices et l'a assigné, l'élève voit une page morte.  
Effort : ~2h. Afficher un message "Exercice guidé — ouvre le cours PDF pour accéder aux exercices" ou stub propre avec CTA.

**Priorité 5 : "J'ai lu" PDF sans obligation de cliquer "Voir le cours" d'abord**  
Pourquoi urgent : logique UX contre-intuitive — l'élève ne comprend pas pourquoi le bouton apparaît après coup.  
Effort : ~20 min. Afficher le bouton "J'ai lu" dès le chargement de la page si le devoir est un PDF non-complété.

---

## 11. Surprises

- **Le score quiz peut dépasser 100% ET échouer silencieusement** — deux bugs enchaînés, le second (API reject) masque le premier (double-count). L'élève est bloqué sans message d'erreur visible.
- **`?welcome=1` param dans l'URL est produit uniquement par le lien "Revoir le tutoriel"** — les APIs join ne le produisent jamais. Le onboarding fonctionne grâce au null check, mais l'intention originale du param semble être de marquer un "premier accès". Cette distinction est perdue.
- **Reconnexion light-mode via pseudo** : si un élève a déjà un compte et retape son pseudo sur le même lien, il est reconnecté silencieusement via un magic link auto-généré côté serveur. Élégant mais complètement invisible pour l'élève — aucun feedback "Reconnexion…" ou "Bienvenue à nouveau !".
- **`finish-quiz` implémente un "best score keeps"** (garde le meilleur score sur plusieurs tentatives) — bonne décision — mais l'UI sur l'écran de score l'annonce toujours avec "Le meilleur score est conservé." même au premier essai. Légèrement absurde.
- **Le Header sur /study/* montre un bouton "Se connecter" via Google OAuth** pour les élèves light-mode (qui n'ont pas de compte Google). Ils sont déjà connectés donc l'avatar s'affiche correctement — mais la présence du bouton "Se connecter" est confusante si l'utilisateur clique dessus.
- **`attempts_count` n'est pas incrémenté dans `finish-quiz`** (upsert sans `attempts_count`) — seul `start-quiz` incrémente. Si un élève quitte avant la fin, `attempts_count` est incrémenté mais `completed_at` ne l'est pas. Comportement acceptable mais potentiellement trompeur pour le professeur.
