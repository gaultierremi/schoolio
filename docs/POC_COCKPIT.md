# POC Cockpit Maia — Documentation

**Branche :** `feat/poc-cockpit-v2`
**Statut :** POC v0.3 — démo avec Adrien (prof DIC Liège)

---

## Vue d'ensemble

Le Cockpit Maia est un co-pilote pédagogique pour enseignants. Il fonctionne en **trois modes** :

1. **Mode Cours** — L'enseignant pilote la session depuis son téléphone. Le projecteur de classe affiche les questions IA en temps réel.
2. **Mode Remplaçant** — Un enseignant remplaçant reçoit un briefing IA complet en entrant un code à 6 chiffres.
3. **Mode Retour** — L'enseignant titulaire retrouve un rapport zen de ce qui s'est passé pendant son absence.

---

## Routes UI

| URL | Description |
|-----|-------------|
| `/feat/cockpit` | Landing — SessionPicker + accès rapide |
| `/feat/cockpit/session/[code]` | Page maître prof (mobile) |
| `/feat/cockpit/display` | Saisie du code projecteur |
| `/feat/cockpit/display/[code]` | Écran projecteur/élèves |
| `/feat/cockpit/end/[code]` | Post-cours : Résumé, Quiz, Flashcards, Devoirs |
| `/feat/cockpit/absence` | Flow absence en 3 étapes |
| `/feat/cockpit/replace` | Saisie du code remplaçant |
| `/feat/cockpit/replace/[code]/briefing` | Briefing IA complet |
| `/feat/cockpit/return` | Rapport zen de retour |

---

## Routes API

### Sessions

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/feat/cockpit/sessions` | Créer une session (pdf_key requis) |
| GET | `/api/feat/cockpit/sessions/[code]` | Lire une session |
| PATCH | `/api/feat/cockpit/sessions/[code]/page` | Heartbeat + page courante |
| PATCH | `/api/feat/cockpit/sessions/[code]/page-state` | Sync scroll_y + zoom |
| POST | `/api/feat/cockpit/sessions/[code]/project-question` | Projeter une question ou révéler la réponse |
| POST | `/api/feat/cockpit/sessions/[code]/back-to-pdf` | Revenir au PDF |
| POST | `/api/feat/cockpit/sessions/[code]/end` | Terminer la session |
| GET | `/api/feat/cockpit/sessions/[code]/contextual-questions` | Questions IA pour la page (`?page=N&generate=true`) |
| POST | `/api/feat/cockpit/sessions/[code]/listen-toggle` | Activer/désactiver l'écoute IA |
| POST | `/api/feat/cockpit/sessions/[code]/whisper` | Générer un whisper IA |
| GET | `/api/feat/cockpit/sessions/[code]/post-course` | Générer un livrable (`?type=summary\|quiz\|flashcards\|homework`) |

### Display (projecteur — accès public)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/feat/cockpit/display/[code]` | Snapshot de session (RLS public) |
| GET | `/api/feat/cockpit/display/[code]/pdf-url` | URL du PDF pour la session |
| GET | `/api/feat/cockpit/display/[code]/projected-question` | Question projetée + réponse si show_answer |

### Mode Remplaçant

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/feat/cockpit/absence` | Créer une absence, retourne replacement_code |
| GET | `/api/feat/cockpit/absence?code=XXXXXX` | Valider un code remplaçant |
| GET | `/api/feat/cockpit/replace/[code]/briefing` | Briefing IA (avec cache) |

---

## Base de données

### Tables créées

**`cockpit_sessions`** — remplace `live_sessions` pour le cockpit
- `code` TEXT UNIQUE — 6 chars alphanumériques (excl. 0, 1, I, L, O)
- `pdf_key` — enum `demo-1|demo-2|demo-3`
- `projected_question_id` FK → `cockpit_questions`
- `show_answer` BOOLEAN
- `listening_active` BOOLEAN
- `transcript` TEXT
- RLS : SELECT USING(true) pour anon (Realtime + projecteur)

**`cockpit_questions`** — questions IA générées pendant le cours
- `session_code` FK → `cockpit_sessions.code`
- `page_start`, `page_end` — plage de pages concernées
- `options` JSONB — tableau de strings
- `answer_index` INTEGER
- `origin` TEXT — `ai` | `bank`

**`absences`** — mode prof remplaçant
- `replacement_code` TEXT UNIQUE — 6 chiffres (CHECK `^[0-9]{6}$`)
- `briefing_cache` TEXT — évite de recalculer l'appel IA
- `is_active` BOOLEAN
- RLS : SELECT USING(true) pour anon

---

## Architecture IA

Tous les appels IA passent par `routeAIRequest()` dans `lib/ai-router.ts` — cascade de 9 providers, pas d'appel direct à l'API Anthropic.

| Contexte | Timeout | Fonction |
|----------|---------|----------|
| Questions QCM | 14s | `generateLiveQuestions()` |
| Whisper élève | 14s | `generateWhisper()` |
| Briefing remplaçant | 60s | `routeAIRequest("cockpit_replacement_briefing")` |
| Résumé/Quiz/Flashcards | 60s | `generatePostCourseDoc()` |
| Devoirs personnalisés | 60s | `generatePersonalizedAssignment()` ×4 en parallèle |

**Whisper fallback** : si `transcript.length < 50`, retourne une question hardcodée depuis `WHISPER_FALLBACKS` (`lib/cockpit/session.ts`). Jamais d'erreur 504 visible pour le prof.

---

## Composants clés

**`CockpitMobileAdapter`** (`app/feat/cockpit/_components/`)
- Adapté de `TeacherCockpitMobile` — supprime `classId`, `sessionId`, `members`, `attendance`
- Random pick mocké client-side avec `MOCK_STUDENTS` (équilibré par pick count)
- Whisper bubble auto-dismiss 8s, déclenché au changement de page si `listening=true`
- API URLs → `/api/feat/cockpit/sessions/[code]/*`

**Écran display** (`app/feat/cockpit/display/[code]/page.tsx`)
- Supabase Realtime `postgres_changes` sur `cockpit_sessions`
- Polling 5s fallback
- 3 modes : `pdf` (page indicator) | `question` | `answer` avec AnimatePresence

**Post-cours** (`app/feat/cockpit/end/[code]/page.tsx`)
- 4 onglets à la demande (lazy generation)
- Devoirs : 4 `PersonalizedAssignment` générés en parallèle, une carte par élève

---

## PDFs de démo

Trois PDFs fictifs hardcodés dans `lib/cockpit/session.ts` :

| key | Titre | Matière |
|-----|-------|---------|
| `demo-1` | Chimie Organique | Mécanismes réactionnels |
| `demo-2` | Mécanique Newtonienne | Dynamique et forces |
| `demo-3` | Thermodynamique | Systèmes et transferts |

Les fichiers PDF réels (`/demo-pdfs/demo-1.pdf` etc.) sont à placer dans `public/demo-pdfs/` (non commités — PDFs d'Adrien à intégrer).

---

## Scénario de démo Adrien

1. Adrien ouvre `/feat/cockpit` → sélectionne **Mécanique Newtonienne** → Démarrer
2. Le projecteur de classe ouvre `/feat/cockpit/display/[code]` sur le grand écran
3. Adrien avance dans le PDF → questions IA apparaissent dans l'onglet Questions
4. Il clique une question → elle apparaît sur le projecteur → élèves votent
5. Il révèle la réponse → la bonne option s'affiche en vert sur le projecteur
6. Il active le micro → en changeant de page, un "whisper" d'élève fictif apparaît (bulle discrète)
7. Il termine le cours → redirigé vers post-cours
8. Post-cours : Résumé généré, Quiz, Flashcards, Devoirs personnalisés pour 4 élèves

**Mode remplaçant** (bonus démo) :
1. Adrien simule une absence : `/feat/cockpit/absence` → code 6 chiffres généré
2. "Remplaçant" ouvre `/feat/cockpit/replace` → entre le code → briefing IA complet
3. Le remplaçant démarre le cours → tout est loggué dans `cockpit_sessions` avec `is_replacement=true`
4. Adrien "revient" : `/feat/cockpit/return` → rapport zen en 3 cartes

---

## Ce qui manque pour la production

- Auth réelle (actuellement routes sans auth pour le POC)
- PDFs réels dans `public/demo-pdfs/`
- Vrai transcript audio (actuellement champ vide → whispers fallback hardcodés)
- Suppression des données de démo (`MOCK_STUDENTS`, `DEMO_PDFS`) → données réelles depuis DB
- Tests E2E du flow complet
