# Sprint 1 — RGPD + PIN Auth Implementation Plan

> **For agentic workers:** Plan léger (Plan B validé par Alex). Tâches structurées par phase avec critères de done. Code complet rédigé au moment de l'exécution (pas inline ici). Drafts juridiques produits par sub-agent dédié (livrés dans `docs/legal-drafts/`).
>
> Exécution : commits successifs au fil de l'eau (style Sprint 0), checkpoints inter-phase.

**Goal:** Implémenter les fondations RGPD compliance + double-auth SSO+PIN pour rendre Maïa déployable en pilote école externe sans risque légal majeur.

**Architecture:**
- **Auth secondaire PIN** : 4 chiffres bcrypt cost 12, un seul PIN par user partagé cross-device, re-demandé une fois par jour (timezone user), fallback SSO après 3 échecs (mémoire `project_pin_auth_spec`).
- **Pages légales publiques** : 4 pages statiques (CGU, mentions légales, politique de confidentialité, politique cookies) sous `/legal/*` avec drafts BE rédigés par sub-agent juridique.
- **Consent flow RGPD** : écran consent post-onboarding pour adultes, workflow parent hashé pour mineurs <16 ans (mémoire `project_consent_parental_minor`).
- **Settings RGPD self-service** : hub `/accueil/parametres/*` avec confidentialité (consentements révocables), export Art. 20, suppression Art. 17 avec anonymisation des tables événementielles (règle interne #23).
- **Audit log** : table `audit_log` déjà existante (migration `20260511050000_audit_log_immutable.sql`), à utiliser via helper `lib/audit/log.ts`.

**Tech Stack :** Next.js 14 (server components + middleware), Supabase (auth + DB + RLS), `bcryptjs` (PIN hash — pure JS, fonctionne en Node 18+), Resend ou stub email transactionnel (envoi parent), vitest (tests TDD helpers), Playwright (smoke E2E).

**Branche :** `claude/sprint-1-rgpd-pin` (créée depuis main `7609c04`).

---

## Phase A — DB foundation (3 tâches)

### Task A1 — Setup état initial + branche

- [ ] Vérifier `git status` et `git log -1` (branche `claude/sprint-1-rgpd-pin`, à jour avec `origin/main`).
- [ ] Lancer `npm run dev` ou au moins `npx tsc --noEmit` pour confirmer baseline propre.

### Task A2 — Migration `user_pin` + `pin_attempts`

**Files :** `supabase/migrations/20260516000000_user_pin_auth.sql`

Schéma cible :
- `user_pin` : `user_id` (PK, FK auth.users ON DELETE CASCADE), `pin_hash` (TEXT bcrypt), `last_unlock_at` (TIMESTAMPTZ), `failed_attempts` (INT default 0), `user_timezone` (TEXT, IANA timezone name pour gérer "prochain matin"), `created_at`, `updated_at`.
- `pin_attempts` (audit log RGPD) : `id`, `user_id`, `success` (BOOLEAN), `ip_hash` (TEXT SHA-256), `attempted_at`. Index sur `(user_id, attempted_at DESC)`.

RLS strict :
- `user_pin` : `WITH CHECK (FALSE)` sur INSERT/UPDATE depuis anon — toute écriture passe par helper server-side avec service role.
- `pin_attempts` : append-only, lecture seule par le user lui-même.

Trigger function `bump_user_pin_updated_at()` avec `SECURITY DEFINER SET search_path = ''` (règle interne #12).

### Task A3 — Migration `consent_records`

**Files :** `supabase/migrations/20260516000100_consent_records.sql`

Schéma cible :
- `consent_records` : `id` (UUID PK), `student_user_id` (FK auth.users ON DELETE CASCADE), `parent_email_hash` (TEXT — bcrypt cost 10, jamais email en clair per mémoire `project_consent_parental_minor`), `signed_at` (TIMESTAMPTZ NULL — null = en attente), `signed_ip_hash` (TEXT SHA-256), `signature_token_hash` (TEXT bcrypt), `expires_at` (TIMESTAMPTZ NOT NULL — typiquement now() + 72h), `created_at`.
- Index : `(student_user_id, signed_at DESC)` pour retrouver le dernier consent signé.
- Index unique partiel : `(student_user_id) WHERE signed_at IS NOT NULL` (1 consent valide par user à la fois).
- RLS : append-only, lecture par le student lui-même seulement (la signature parent passe par token via API publique).
- CHECK constraint sur expires_at (au moins +1h après created_at).

---

## Phase B — Helpers TDD (2 tâches)

### Task B1 — `lib/auth/pin.ts` (bcrypt + rate-limit)

**Files :**
- Create : `lib/auth/pin.ts`
- Test : `tests/lib/auth-pin.test.ts`

API publique :
- `hashPin(pin: string): Promise<string>` — valide format (4 chars numériques), bcrypt cost 12.
- `verifyPin(pin: string, hash: string): Promise<boolean>` — `bcrypt.compare`, retourne false si format invalide (pas d'exception).
- `isUnlockExpired(lastUnlockAt: Date | null, userTimezone: string, now?: Date): boolean` — pure function, retourne true si `last_unlock_at` est antérieur à minuit local user (timezone IANA).
- `shouldFallbackSSO(failedAttempts: number): boolean` — true si ≥ 3.

Tests vitest :
- `hashPin("1234")` retourne un hash bcrypt valide ($2b$12$...)
- `hashPin("abc")` rejette (4 chiffres requis)
- `hashPin("12345")` rejette (longueur)
- `verifyPin("1234", hash)` true ; `verifyPin("1235", hash)` false
- `isUnlockExpired(null, "Europe/Brussels")` → true (jamais unlock = expiré)
- `isUnlockExpired(yesterday23h59_utc, "Europe/Brussels", today08h_utc)` → true (changement de jour local)
- `isUnlockExpired(today07h_utc, "Europe/Brussels", today08h_utc)` → false (même jour local)
- `shouldFallbackSSO(0..2)` → false ; `shouldFallbackSSO(3)` → true

Installer `bcryptjs` (pure JS, fonctionne partout) : `npm install bcryptjs @types/bcryptjs`.

### Task B2 — `lib/audit/log.ts` (append-only writer)

**Files :**
- Create : `lib/audit/log.ts`
- Test : `tests/lib/audit-log.test.ts`

API publique :
- `logAuditEvent({ userId, action, target, metadata }): Promise<void>` — wrappe l'insert dans `audit_log` via service role client, fire-and-forget mais log les erreurs.
- Actions canoniques (constantes exportées) : `SSO_LOGIN`, `PIN_SETUP`, `PIN_SUCCESS`, `PIN_FAILURE`, `PIN_LOCKOUT`, `CONSENT_GIVEN`, `CONSENT_REVOKED`, `DATA_EXPORT_REQUESTED`, `ACCOUNT_DELETION_REQUESTED`, `ACCOUNT_ANONYMIZED`.

Tests vitest : mocker le supabase admin client, vérifier que l'insert est appelé avec la bonne shape + que les erreurs sont catchées sans propagation.

---

## Phase C — PIN auth flow (5 tâches)

### Task C1 — `/onboarding/pin-setup` (page + API route)

**Files :**
- Create : `app/onboarding/pin-setup/page.tsx` (server component, `requireUser` check)
- Create : `app/onboarding/pin-setup/PinSetupClient.tsx` (4 inputs numériques + confirmation)
- Create : `app/api/auth/pin/setup/route.ts` (POST `{ pin: string }`, valide, hash, insert/upsert `user_pin`, log audit `PIN_SETUP`)

Critères :
- Si user déjà a un `user_pin` row → redirect `/accueil` (pas de re-setup, doit passer par "PIN oublié" → reset)
- Validation client + server : 4 chiffres exactement, re-saisie identique pour confirmation
- Persistance timezone : capturer `Intl.DateTimeFormat().resolvedOptions().timeZone` côté client, envoyer dans POST body
- Après setup réussi : `last_unlock_at = NOW()` (le user vient juste de finir SSO, considéré comme unlocked)
- Redirect post-succès → `next` query param OU `/accueil`

### Task C2 — `/auth/pin-unlock` (page + API route)

**Files :**
- Create : `app/auth/pin-unlock/page.tsx` (server component)
- Create : `app/auth/pin-unlock/PinUnlockClient.tsx`
- Create : `app/api/auth/pin/verify/route.ts` (POST `{ pin: string }`)

Critères :
- Page accessible aux users authentifiés uniquement (pas de session = redirect `/login`)
- 3 essais max avant fallback SSO. Compteur stocké en DB (`user_pin.failed_attempts`).
- Sur success : `failed_attempts = 0`, `last_unlock_at = NOW()`, log audit `PIN_SUCCESS`
- Sur échec 1-2 : message d'erreur, increment `failed_attempts`, log audit `PIN_FAILURE`
- Sur échec 3 : log audit `PIN_LOCKOUT`, force SSO sign-out + redirect `/login` (l'user devra se re-loger SSO)
- Bouton "PIN oublié" → `signOut()` puis redirect `/login` (le SSO callback re-créera la session, et le user pourra setup un nouveau PIN via Task C5)

### Task C3 — Middleware : check PIN unlock daily

**Files :**
- Modify : `middleware.ts`

Logique à ajouter (après le check user auth, avant le routing) :
- Si user authentifié ET path ne commence pas par `/auth/`, `/legal/`, `/onboarding/` ou `/api/` :
  - Fetch `user_pin` row (via service role client dans middleware — vérifier que c'est possible avec edge runtime, sinon utiliser `runtime: 'nodejs'` sur le middleware ce qui est OK depuis Next.js 13.5+)
  - Si pas de row → redirect `/onboarding/pin-setup?next=<current>`
  - Si row existe et `isUnlockExpired(last_unlock_at, user_timezone)` → redirect `/auth/pin-unlock?next=<current>`
- Sinon : laisse passer

Note : ajouter `runtime = 'nodejs'` dans `middleware.ts` si bcryptjs ou pg-bound query ne tournent pas en edge runtime.

### Task C4 — Page `/auth/error`

**Files :**
- Create : `app/auth/error/page.tsx`

Critères : page server qui affiche un message d'erreur générique OAuth avec lien retour `/login` et email contact `pilotes@maia.app`. Couvre les cas : token expiré, refus consentement OAuth, callback échoué. Lecture `?error=<code>&description=<msg>` query params depuis Supabase OAuth callback.

### Task C5 — "PIN oublié" reset flow

**Files :**
- Modify : `app/api/auth/pin/verify/route.ts` (Task C2) — ajouter endpoint sibling `DELETE /api/auth/pin` pour reset
- Modify : `app/auth/pin-unlock/PinUnlockClient.tsx` — bouton "PIN oublié" appelle DELETE puis redirect `/login`

Critères : DELETE supprime la row `user_pin` du user courant, log audit `PIN_RESET_REQUESTED`. À la prochaine connexion SSO, le middleware détecte l'absence de pin et redirige vers `/onboarding/pin-setup`.

---

## Phase D — Pages légales avec drafts juridiques (4 tâches)

⚠️ **Drafts produits par sub-agent juridique** dans `docs/legal-drafts/` (lancé en parallèle). Quand l'agent rend les 4 fichiers, l'intégration dans les pages Next.js est mécanique : lire le markdown, le coller dans un component server avec un layout `/legal/layout.tsx` partagé.

### Task D1 — Layout `/legal/*` + Route `/legal/cgu`

**Files :**
- Create : `app/legal/layout.tsx` (layout server simple : header retour + container max-w-3xl + Footer mentions)
- Create : `app/legal/cgu/page.tsx` (intègre `docs/legal-drafts/cgu-fr-be-draft.md` rendu en JSX ou via `react-markdown`)

Critères : pages **publiques** (pas de auth required dans le middleware — ajouter `/legal` aux PUBLIC_PATHS si nécessaire), rendu propre avec typographie lisible, lien retour `/` et lien email DPO.

### Task D2 — Route `/legal/mentions-legales`

**Files :** `app/legal/mentions-legales/page.tsx`

Mêmes critères que D1. Texte plus court (~300-500 mots).

### Task D3 — Route `/legal/confidentialite`

**Files :** `app/legal/confidentialite/page.tsx`

Texte le plus long (3000-4000 mots). Découper visuellement en sections h2 navigables (TOC en haut sur desktop, sticky sidebar si pertinent).

### Task D4 — Route `/legal/cookies`

**Files :** `app/legal/cookies/page.tsx`

Tableau des cookies utilisés (cf. mémoire `feedback_no_pricing_public` + draft). Pas de bannière de consent pour le moment (uniquement cookies essentiels Supabase auth + next-themes prefs). Lien retour vers `/legal/confidentialite`.

---

## Phase E — Consent flow (3 tâches)

### Task E1 — `/onboarding/consent-rgpd` (adulte)

**Files :**
- Create : `app/onboarding/consent-rgpd/page.tsx` (server, `requireUser`)
- Create : `app/onboarding/consent-rgpd/ConsentClient.tsx` (form avec date de naissance + checkbox consent + boutons)
- Create : `app/api/consent/give/route.ts` (POST)

Critères :
- Champ "Date de naissance" obligatoire (ou checkbox "Je confirme avoir 16 ans ou plus")
- Si adulte (≥16 ans) :
  - Checkbox "J'accepte la politique de confidentialité" avec lien vers `/legal/confidentialite`
  - Bouton "Continuer" → POST `/api/consent/give` → insert `consent_records` row avec `signed_at = NOW()` (auto-signature pour adulte), `parent_email_hash = NULL`, log audit `CONSENT_GIVEN`
  - Redirect `/onboarding/pin-setup` (ou `/accueil` si pin déjà setup)
- Si mineur → bascule sur flow Task E2

### Task E2 — Workflow parent mineur

**Files :**
- Modify : `app/onboarding/consent-rgpd/ConsentClient.tsx` — affiche le sous-flow mineur
- Create : `app/api/consent/request-parent/route.ts` (POST `{ parent_email: string }`)
- Create : `app/onboarding/consent-rgpd/en-attente/page.tsx` (page d'attente après envoi mail parent)

Critères :
- Mineur ne peut pas auto-signer. Écran texte : "Tu dois consulter un parent. Voici un email à envoyer au parent pour qu'il signe le consentement à ta place."
- Form champ "Email parent" + bouton "Envoyer la demande"
- POST `/api/consent/request-parent` :
  - Hash email parent (bcrypt cost 10)
  - Génère token UUID + hash token
  - Insert `consent_records` avec `parent_email_hash`, `signature_token_hash`, `expires_at = NOW() + 72h`, `signed_at = NULL`
  - Envoie email parent via Resend (ou stub `console.log` si Resend pas configuré) avec lien `${BASE_URL}/legal/consent/${rawToken}`
  - **L'email parent en clair NE SORT JAMAIS de la fonction POST** : utilisé uniquement pour l'envoi, jamais persisté
  - Log audit `CONSENT_PARENT_REQUESTED`
- Redirect `/onboarding/consent-rgpd/en-attente` qui affiche "Demande envoyée — l'accès sera débloqué une fois le parent ayant signé"
- Bouton "Renvoyer la demande" sur la page d'attente (idempotent : update même row si pas expirée, sinon nouvelle)

### Task E3 — Page signature parent `/legal/consent/[token]`

**Files :**
- Create : `app/legal/consent/[token]/page.tsx` (server, **publique non-auth required**, lit le token depuis URL)
- Create : `app/legal/consent/[token]/SignClient.tsx`
- Create : `app/api/consent/sign/route.ts` (POST)

Critères :
- Page server fetch `consent_records WHERE signature_token_hash = bcrypt.hash(token, salt)` — mais bcrypt n'est pas indexable... **alternative** : hasher le token avec SHA-256 (déterministe) et stocker ce hash. Le lookup devient `WHERE signature_token_hash = sha256(rawToken)`. SHA-256 est suffisant car le token UUID v4 est déjà unguessable.
- Si row trouvée + non-expirée + `signed_at IS NULL` : affiche le résumé "Votre enfant {prénom} souhaite utiliser Maïa. Voici les données collectées..." + checkbox "Je consens" + champ "Votre nom + date" pour signature
- Sur submit : POST `/api/consent/sign` avec token + nom + date :
  - Verify token hash match
  - Update row : `signed_at = NOW()`, `signed_ip_hash = sha256(req.ip)`, store name hashé si voulu (ou en clair selon arbitrage juriste — pour MVP on hash)
  - Log audit `CONSENT_SIGNED_BY_PARENT` (avec student_user_id, pas email parent)
- Affiche page de succès "Merci, votre enfant peut maintenant utiliser Maïa"
- Le student lui-même, à sa prochaine visite, voit son consent comme valide et peut continuer l'onboarding

---

## Phase F — Settings RGPD (3 tâches)

### Task F1 — Hub `/accueil/parametres` + `/confidentialite`

**Files :**
- Create : `app/accueil/parametres/page.tsx` (hub, liste de liens vers sous-pages)
- Create : `app/accueil/parametres/confidentialite/page.tsx` (server, fetch consent_records + audit log subset du user)
- Create : `app/accueil/parametres/confidentialite/ConfidentialiteClient.tsx` (interactions révocation)

Critères :
- Hub : liste cards vers Mon compte (déjà Sprint 1.5), Confidentialité, Export des données, Suppression du compte
- Confidentialité : affiche les consentements donnés (date, type), bouton "Révoquer" qui POST `/api/consent/revoke` (insert nouveau audit + update consent row `revoked_at`) — note : révoquer n'efface pas les données déjà traitées, voir Suppression Task F3
- Affiche les 20 derniers événements audit pertinents (SSO login, PIN events, consent events) — RGPD Art. 15 (droit d'accès)

### Task F2 — Export des données (Art. 20 RGPD)

**Files :**
- Create : `app/accueil/parametres/export-donnees/page.tsx`
- Create : `app/api/parametres/export/route.ts` (GET, retourne JSON)

Critères :
- Page explique la démarche, bouton "Télécharger mes données"
- API GET aggrège (via service role) les tables : user_profiles, class_memberships, assignment_question_answers, quiz_completions, live_session_answers, mastery, audit_log (subset), consent_records (sans hashes). Format JSON structuré par catégorie.
- Headers : `Content-Disposition: attachment; filename=maia-export-{userId}-{YYYY-MM-DD}.json`
- Log audit `DATA_EXPORT_REQUESTED`
- **MVP** : génère synchroniquement (rapide pour un user typique). **Post-MVP** : si lourd, basculer vers job async + email avec lien temporaire.

### Task F3 — Suppression du compte (Art. 17 + anonymisation)

**Files :**
- Create : `app/accueil/parametres/suppression-compte/page.tsx`
- Create : `app/accueil/parametres/suppression-compte/DeleteClient.tsx`
- Create : `app/api/parametres/delete-account/route.ts` (POST)

Critères :
- Page avec disclaimer clair : ce qui est supprimé (compte, profil, PIN) vs ce qui est anonymisé (assignment_question_answers, class_memberships, quiz_completions, live_session_answers, audit_log — règle interne #23, never DELETE pour préserver les stats longitudinales)
- Double confirmation : checkbox "Je comprends que cette action est irréversible" + saisie "SUPPRIMER" dans un input
- POST :
  - Anonymisation : UPDATE des tables événementielles → `student_user_id` remplacé par un UUID anonyme (`anon-{random}`) ; `user_profiles.first_name` → "Utilisateur supprimé", email retiré.
  - DELETE : `user_pin`, lignes nominatives (`user_profiles` peut être anonymisé plutôt que delete).
  - Sign out global
  - Log audit `ACCOUNT_ANONYMIZED` (au nom de l'ancien user, juste avant la transformation)
  - Redirect `/` (landing) avec message "Ton compte a été supprimé"
- **NE PAS** dropper les rows événementielles (mémoire `feedback_no_pricing_public` règle interne #23) — anonymiser uniquement.

---

## Phase G — Tests + PR (3 tâches)

### Task G1 — Validation finale locale

- [ ] `npx tsc --noEmit` : EXIT=0
- [ ] `npx vitest run` : tous tests verts (au moins +6 nouveaux : pin.ts + audit/log.ts + intégration consent)
- [ ] `npm run build` (si env vars Supabase configurées) : Compiled successfully

### Task G2 — Smoke E2E manuel

Parcours à valider une fois en preview Vercel ou local :
- 1er SSO → écran consent RGPD → choix adulte → setup PIN → /accueil
- Re-login après 24h → écran pin-unlock → saisie correcte → /accueil
- 3 échecs PIN → sign-out automatique → /login
- PIN oublié → redirect login → setup nouveau PIN
- Mineur : consent → demande parent → email envoyé → parent signe → student peut continuer
- Settings : confidentialité → révoquer consent (test) ; export → télécharge JSON ; suppression → anonymisation (sur compte test uniquement !)
- Pages légales `/legal/*` accessibles publiquement, non-auth

### Task G3 — Ouverture PR draft

- [ ] Audit règle 20 CLAUDE.md (grep patterns suspects sur le diff)
- [ ] Push `claude/sprint-1-rgpd-pin`
- [ ] `gh pr create --draft` avec body structuré (summary, changements, test plan, notes sur drafts juridiques à faire valider par juriste BE avant pilote payant)

---

## Self-review

### Couverture spec
| Décision spec / mémoire | Task |
|---|---|
| PIN 4 chars bcrypt cost 12 (mémoire `project_pin_auth_spec`) | A2 + B1 + C1-C5 |
| Un seul PIN partagé cross-device (mémoire) | A2 schema |
| Timezone user pour "prochain matin" (mémoire) | A2 + B1 `isUnlockExpired` |
| Fallback SSO 3 échecs (mémoire) | C2 |
| PIN reset via "PIN oublié" → re-SSO (mémoire) | C5 |
| Workflow parent mineur, email hashé jamais en clair (mémoire `project_consent_parental_minor`) | A3 + E2 + E3 |
| Pages légales 4 BE (PAGES-WORKFLOW §7) | D1-D4 + sub-agent juridique |
| Consent RGPD adulte (Art. 7) | E1 |
| Hub paramètres + révocation consentements (Art. 15) | F1 |
| Export Art. 20 RGPD | F2 |
| Suppression Art. 17 avec anonymisation (règle interne #23 CLAUDE.md) | F3 |
| Audit log immutable hooks | B2 + intégrations partout |
| Anthropic US transfert SCC Art. 46(2)(c) | Inclus dans draft confidentialité |

### Placeholders à scanner
- Drafts juridiques produits par sub-agent en parallèle — fichiers `docs/legal-drafts/*.md` ne doivent contenir aucun `TBD/TODO/XXX`, uniquement les `[À COMPLÉTER : ...]` explicites pour les infos éditeur.
- Pas de TODO dans le code à committer.

### Gaps connus / décisions à confirmer pendant exécution
- **Provider email parent** : Resend ou Postmark à choisir. Si pas configuré pendant le sprint → stub `console.log` + flag dans le code "EMAIL_PROVIDER_PENDING" + tâche follow-up.
- **Sensitive data flag Vercel** : les nouvelles env vars (RESEND_API_KEY, etc.) à provisionner côté Vercel.
- **Bcrypt edge compatibility** : le middleware doit déclarer `runtime = 'nodejs'` si bcrypt ne tourne pas en edge. À vérifier au moment du C3.
- **DPIA stub** : pas dans Sprint 1 (post-MVP per spec §2.1 stub minimum suffit) — la politique de confidentialité de D3 documente déjà les traitements, ce qui est l'essentiel.

---

## Execution Handoff

**Plan léger complete et sauvé.** Exécution proposée : **inline** style Sprint 0 (commits successifs, checkpoints inter-phase, validation par Alex). Pas de subagent-driven car les phases sont fortement séquentielles (DB → helpers → flow auth → consent → settings) et l'overhead d'orchestration ne se justifie pas.

Démarrage : Phase A1 (state check) immédiatement après validation de ce plan par Alex.
