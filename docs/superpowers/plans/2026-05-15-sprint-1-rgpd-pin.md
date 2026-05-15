# Sprint 1A — RGPD + PIN Auth (Lean) Implementation Plan

> **Plan révisé après hard review.** Sprint 1 splitté en 1A (dogfood-ready, ~3-4j) + 1B (pilote-école-ready, ~3j). Ce document couvre Sprint 1A. Sprint 1B = follow-up tracké en bas.
>
> Exécution : commits successifs au fil de l'eau, checkpoints inter-phase.

**Goal:** Rendre Maïa déployable en dogfood interne avec auth PIN + pages légales BE + consent adulte. Aucune dette architecturale (middleware perf-OK, suppression sans UPDATE massif, pages légales factorisées).

**Architecture (8 fixes intégrés depuis hard review)** :

1. **PIN re-auth via cookie HttpOnly signé**, pas DB query en middleware. Le cookie `maia_pin_unlocked_until=<ts>` (24h TTL) suffit au middleware. La DB est touchée UNIQUEMENT au moment du unlock (POST `/api/auth/pin/verify`).
2. **Pages légales factorisées** : 1 composant server `<LegalPage slug>` qui lit `docs/legal-drafts/{slug}-fr-be-draft.md` via fs.readFile + 4 routes minimales `app/legal/{cgu,mentions-legales,confidentialite,cookies}/page.tsx`. 1 vraie tâche, pas 4.
3. **Routes légales sous `/legal/*`** (cohérent PAGES-WORKFLOW.md, cohérent avec future `/legal/consent/[token]`).
4. **Email provider swappable** via `lib/email/send.ts` (Resend ou stub). Si pas configuré → fallback `displayInlineLink` pour que l'élève envoie manuellement à son parent par WhatsApp/SMS (Sprint 1B).
5. **Consent adulte uniquement en 1A** (workflow parent mineur = 1B). Pilote dogfood interne = adultes uniquement.
6. **Settings minimal en 1A** : hub + confidentialité (révoquer/lister). Export Art. 20 + suppression Art. 17 = 1B.
7. **Suppression compte via table `anonymized_users`** (1B) : 1 INSERT au lieu de N×UPDATE sur tables événementielles.
8. **Test E2E Playwright PIN flow** skip-by-default (pattern `multi-tenant-isolation.spec.ts`).

**Tech Stack :** Next.js 14, Supabase (auth + DB + RLS), `bcryptjs` (PIN hash pure JS), cookie HttpOnly signé via Next.js `cookies()`, vitest (TDD), Playwright (E2E skip-by-default).

**Branche :** `claude/sprint-1-rgpd-pin` (Sprint 1A + 1B sur la même branche, 2 PR séparées au final).

---

## Phase A — DB foundation (3 tâches)

### Task A1 — Migration `user_pin` + `pin_attempts`

**Files :** `supabase/migrations/20260516000000_user_pin_auth.sql`

Schéma :
- `user_pin (user_id UUID PK FK auth.users ON DELETE CASCADE, pin_hash TEXT NOT NULL, last_unlock_at TIMESTAMPTZ, failed_attempts INT NOT NULL DEFAULT 0, user_timezone TEXT NOT NULL DEFAULT 'Europe/Brussels', created_at, updated_at)`
- `pin_attempts (id UUID PK, user_id UUID FK auth.users ON DELETE CASCADE, success BOOLEAN NOT NULL, ip_hash TEXT, attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` + index `(user_id, attempted_at DESC)`
- RLS strict (`WITH CHECK (FALSE)` sur anon, lecture limitée à user lui-même via auth.uid())
- Trigger `bump_user_pin_updated_at()` SECURITY DEFINER SET search_path = '' (règle interne #12)

Done : migration commitée, applicable proprement (à valider en preview Vercel).

### Task A2 — Migration `consent_records`

**Files :** `supabase/migrations/20260516000100_consent_records.sql`

Schéma :
- `consent_records (id UUID PK, student_user_id UUID FK auth.users ON DELETE CASCADE, parent_email_hash TEXT NULL, signed_at TIMESTAMPTZ NULL, signed_ip_hash TEXT NULL, signature_token_hash TEXT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at)` 
- CHECK : `expires_at > created_at + INTERVAL '1 hour'`
- Index unique partiel sur `(student_user_id) WHERE signed_at IS NOT NULL` (un seul consent valide à la fois)
- RLS : append-only via service role, lecture par l'user authentifié pour ses propres rows

**Note** : la colonne `parent_email_hash` reste NULL pour les adultes (signature auto). Permet de réutiliser la même table pour mineurs en Sprint 1B sans nouvelle migration.

### Task A3 — Migration `anonymized_users` (prévue Sprint 1B, déjà cadrée ici)

**Skip Sprint 1A**, fait en Sprint 1B. Mentionné pour clarté.

---

## Phase B — Helpers TDD (3 tâches)

### Task B1 — `lib/auth/pin.ts`

**Files :** `lib/auth/pin.ts` + `tests/lib/auth-pin.test.ts`

Install : `npm install bcryptjs @types/bcryptjs`

API publique :
- `hashPin(pin: string): Promise<string>` — valide format 4 chiffres, bcrypt cost 12
- `verifyPin(pin: string, hash: string): Promise<boolean>` — pas d'exception sur format invalide, retourne false
- `shouldFallbackSSO(failedAttempts: number): boolean` — `>= 3`

Tests vitest TDD (RED → GREEN) :
- Format validation
- Hash + verify roundtrip
- Wrong PIN returns false
- shouldFallbackSSO thresholds

**Note importante** : pas de `isUnlockExpired` ici. La fraîcheur du unlock est portée par le cookie signé (cf. B2), pas par une comparaison de timestamp DB.

### Task B2 — `lib/auth/pin-cookie.ts`

**Files :** `lib/auth/pin-cookie.ts` + `tests/lib/auth-pin-cookie.test.ts`

API publique :
- `signPinUnlockCookie(userId: string, ttlHours: number = 24): string` — JWT signé HS256 avec secret env `PIN_COOKIE_SECRET`, payload `{ sub: userId, exp: now + ttlHours*3600 }`
- `verifyPinUnlockCookie(token: string): { userId: string } | null` — vérifie signature + expiration, retourne null sinon
- Constante `PIN_COOKIE_NAME = "maia_pin_unlocked"`

Tests vitest :
- Sign + verify roundtrip
- Expired token returns null
- Tampered signature returns null
- Wrong secret returns null

Install : `npm install jose` (JWT signing/verifying, edge-safe contrairement à `jsonwebtoken`).

### Task B3 — `lib/audit/log.ts` + `lib/email/send.ts`

**Files :**
- `lib/audit/log.ts` + `tests/lib/audit-log.test.ts`
- `lib/email/send.ts` + `tests/lib/email-send.test.ts`

`lib/audit/log.ts` :
- `logAuditEvent({ userId, action, target?, metadata? }): Promise<void>` — fire-and-forget insert dans `audit_log` via admin client
- Constantes exportées : `AUDIT_ACTIONS = { SSO_LOGIN, PIN_SETUP, PIN_SUCCESS, PIN_FAILURE, PIN_LOCKOUT, PIN_RESET, CONSENT_GIVEN, CONSENT_REVOKED }`

`lib/email/send.ts` (abstraction swappable) :
- `sendEmail({ to, subject, html, text }): Promise<{ ok: boolean; provider: string }>` 
- Implémentation : si `RESEND_API_KEY` set → Resend ; sinon stub `console.log("[email stub]", to, subject)` + return ok:true (provider: "stub")
- Future-proof : on peut ajouter Postmark/AWS SES via flag env sans toucher les call sites

Tests vitest : mock supabase admin, mock fetch resend. Verify shape.

---

## Phase C — PIN auth flow (4 tâches)

### Task C1 — `/onboarding/pin-setup` page + API

**Files :**
- `app/onboarding/pin-setup/page.tsx` (server, `requireUser`)
- `app/onboarding/pin-setup/PinSetupClient.tsx` (4 inputs numériques, confirmation)
- `app/api/auth/pin/setup/route.ts` (POST)

Logique :
- Server page : si `user_pin` row existe → redirect `/accueil` (pas de re-setup direct)
- Client : 4 chiffres + re-saisie identique pour confirm + capture timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`
- POST `/api/auth/pin/setup` :
  - Valide PIN format
  - `hashPin(pin)` → INSERT/UPSERT `user_pin` avec `last_unlock_at = NOW()`, `failed_attempts = 0`, `user_timezone`
  - Set cookie HttpOnly signé via `signPinUnlockCookie(user.id)` 
  - Log audit `PIN_SETUP`
  - Return 200 `{ ok: true, redirectTo: nextParam || "/accueil" }`

### Task C2 — `/auth/pin-unlock` page + API

**Files :**
- `app/auth/pin-unlock/page.tsx` (server, vérifie user auth)
- `app/auth/pin-unlock/PinUnlockClient.tsx`
- `app/api/auth/pin/verify/route.ts` (POST)

Logique :
- POST `/api/auth/pin/verify` :
  - Fetch `user_pin` row du user. Si absente → 400 "Setup PIN d'abord"
  - `verifyPin(pin, hash)` :
    - Success → reset `failed_attempts = 0`, update `last_unlock_at = NOW()`, set cookie signé, log `PIN_SUCCESS`, return `{ ok, redirectTo }`
    - Failure → increment `failed_attempts`, log `PIN_FAILURE`
    - Si `shouldFallbackSSO(failed_attempts + 1)` → log `PIN_LOCKOUT`, return `{ ok: false, lockedOut: true }`. Le client appelle alors `supabase.auth.signOut()` + redirect `/login`.

### Task C3 — Middleware : check cookie PIN

**Files :** `middleware.ts` (modify)

Logique ajoutée APRÈS le check auth, AVANT le routing role :
- Si user authentifié ET path ne commence pas par `/auth/`, `/legal/`, `/onboarding/`, `/api/` :
  - Lire cookie `maia_pin_unlocked` via `request.cookies.get(PIN_COOKIE_NAME)`
  - `verifyPinUnlockCookie(token)` :
    - Si null → besoin d'unlock. Test 1 : user a-t-il un PIN setup ? (query DB `user_pin` row existance — seul DB hit acceptable, peut être cached via headers ou en stockant un flag dans la session Supabase) — pour MVP : 1 query simple `SELECT 1 FROM user_pin WHERE user_id = ?`
      - Si pas de PIN row → redirect `/onboarding/pin-setup?next=<current>`
      - Si PIN row → redirect `/auth/pin-unlock?next=<current>`
    - Si valide → laisse passer

**Optimisation lean** : on peut cache la présence du PIN row dans `app_metadata.has_pin = true` (set au setup). Le middleware lit alors `user.app_metadata.has_pin` sans DB query. À faire en B/C1.

### Task C4 — Page `/auth/error` + bouton "PIN oublié"

**Files :**
- `app/auth/error/page.tsx` (server, lit query params `?error&description`)
- Modify `app/auth/pin-unlock/PinUnlockClient.tsx` : bouton "PIN oublié" → DELETE `/api/auth/pin` → signout → redirect `/login`
- `app/api/auth/pin/route.ts` (DELETE handler — supprime `user_pin` row, clear cookie, log `PIN_RESET`)

---

## Phase D — Pages légales factorisées (1 tâche)

### Task D1 — Composant `<LegalPage>` + 4 routes

**Files :**
- `components/LegalPage.tsx` — server component, prop `slug: "cgu" | "mentions-legales" | "confidentialite" | "cookies"`, lit `docs/legal-drafts/${slug}-fr-be-draft.md` via `fs.readFile` (cache build-time), rend via `react-markdown` (déjà installé).
- `app/legal/layout.tsx` — header retour `/` + max-w-3xl container + footer minimal (lien `/legal/mentions-legales` + `pilotes@maia.app`)
- `app/legal/cgu/page.tsx` — `export default () => <LegalPage slug="cgu" />`
- `app/legal/mentions-legales/page.tsx` — idem
- `app/legal/confidentialite/page.tsx` — idem
- `app/legal/cookies/page.tsx` — idem

Middleware update : ajouter `/legal` dans la liste des paths publics (pas d'auth requis).

Done : navigation publique `/legal/*` fonctionne, contenu issu des drafts juridiques rédigés en parallèle, rendu typo lisible.

---

## Phase E1 — Consent adulte (1 tâche)

### Task E1 — `/onboarding/consent-rgpd` adulte seulement

**Files :**
- `app/onboarding/consent-rgpd/page.tsx` (server, requireUser)
- `app/onboarding/consent-rgpd/ConsentAdulteClient.tsx`
- `app/api/consent/give/route.ts` (POST)

Logique Sprint 1A :
- Server page : si consent_records signé existe pour ce user → redirect `/onboarding/pin-setup` (next step) ou `/accueil`
- Client : date de naissance (input date) + checkbox "J'accepte la politique de confidentialité" (lien `/legal/confidentialite` ouvre nouvel onglet) + bouton "Continuer"
- Si date < 16 ans calculée → message "Le workflow mineur arrive en Sprint 1B — contacte pilotes@maia.app pour t'inscrire en attendant" (graceful stop pour MVP dogfood adultes-only)
- POST `/api/consent/give` :
  - Insert `consent_records` row avec `signed_at = NOW()`, `parent_email_hash = NULL`, `expires_at = NOW() + INTERVAL '99 years'` (signed adulte n'expire pas en pratique)
  - Log audit `CONSENT_GIVEN`
  - Return `{ ok, redirectTo: "/onboarding/pin-setup" }`

---

## Phase F1 — Settings minimum (1 tâche)

### Task F1 — Hub `/accueil/parametres` + `/confidentialite` minimum

**Files :**
- `app/accueil/parametres/page.tsx` — server hub : liste cards vers /compte (déjà Sprint 1.5) + /confidentialite + (placeholders disabled "Export — Sprint 1B" et "Suppression — Sprint 1B" pour transparency)
- `app/accueil/parametres/confidentialite/page.tsx` — server : fetch consent_records du user + 20 derniers audit_log events pertinents
- Affichage : table consents (date, type), table audit récente (SSO/PIN events) — RGPD Art. 15 droit d'accès basique
- Bouton "Révoquer le consentement" disabled avec note "Disponible en Sprint 1B avec suppression du compte"

**Note lean** : on offre Art. 15 (lecture des données) en Sprint 1A. La révocation effective (Art. 7(3)) + Art. 17 (effacement) + Art. 20 (portabilité) sont liées et arrivent ensemble en Sprint 1B.

---

## Phase G — Tests + PR (2 tâches)

### Task G1 — Validation locale finale

- `npx tsc --noEmit` : EXIT=0
- `npx vitest run` : tous tests verts (au moins +12-15 nouveaux : pin.ts + pin-cookie.ts + audit/log.ts + email/send.ts)
- Sweep CLAUDE.md règle 20 : `git diff main..HEAD | grep -E "auth\.getUser|SUPABASE_SERVICE_ROLE_KEY|user_metadata\.role|window\.open|dangerouslySetInnerHTML|RANDOM\(\)|Math\.random\(\).*invit|\.includes.*@"` → 0 violation suspecte

### Task G2 — Smoke E2E + PR

- Test Playwright `tests/e2e/pin-auth.spec.ts` skip-by-default (pattern `multi-tenant-isolation.spec.ts`) : couvre setup PIN → unlock daily → 3 échecs lockout → PIN oublié reset
- Push branche `claude/sprint-1-rgpd-pin`
- `gh pr create --draft` avec body structuré (résumé Sprint 1A, scope 1B en notes, drafts juridiques à faire valider par juriste BE avant pilote payant)

---

## Sprint 1B (follow-up, ~3 jours, à démarrer après merge 1A)

Backlog clair pour ne rien perdre :

- **Workflow parent mineur** (E2 + E3) :
  - Sous-flow mineur dans `/onboarding/consent-rgpd` : "demande à un parent" + form email parent → hash + envoi via `lib/email/send.ts` (avec fallback inline link si provider absent)
  - Page `/legal/consent/[token]` : signature parent via token (SHA-256 lookup, plus simple que bcrypt indexable)
  - `/onboarding/consent-rgpd/en-attente` (polling status)
- **Export Art. 20** : page + API `/api/parametres/export` (JSON aggregate via service role)
- **Suppression Art. 17 via anonymisation table** :
  - Migration `anonymized_users (user_id PK, anonymized_at)` 
  - Update toutes vues/queries nommées substituer "Utilisateur supprimé" si user_id matche
  - 1 INSERT au DELETE compte (pas N×UPDATE)
- **Audit log retention** : cron mensuel Trigger.dev DELETE `audit_log WHERE created_at < NOW() - INTERVAL '5 years'`
- **DPIA stub** : doc minimal dans `docs/dpia-stub.md` listant traitements + bases légales + mesures sécurité (cf. spec §2.1)
- **Activation Microsoft SSO** quand provider Supabase configuré (réactiver le bouton désactivé en Sprint 0 F3)

---

## Self-review

### Couverture mémoires
| Mémoire / Décision | Sprint 1A | Sprint 1B |
|---|---|---|
| `project_pin_auth_spec` (bcrypt cost 12, fallback SSO 3 échecs, timezone user, un seul PIN partagé) | ✅ Phases A-C | — |
| `project_consent_parental_minor` (workflow parent hashé) | — | ✅ E2-E3 |
| Règle interne #23 (never DELETE événementiel) | ✅ documenté plan | ✅ implémenté F3 |
| `project_role_model_2_values` (teacher \| student) | ✅ cohérent middleware | — |
| Anthropic US transfert SCC Art. 46(2)(c) | ✅ dans draft confidentialité | — |
| Pages légales BE conformes RGPD | ✅ Phase D | — |

### Anti-patterns évités (vs plan initial v1)
- ❌ Plan v1 : middleware bcrypt à chaque page → ✅ Plan v2 cookie signé HttpOnly (B2)
- ❌ Plan v1 : 4 tâches dupliquées pages légales → ✅ Plan v2 1 composant factorisé (D1)
- ❌ Plan v1 : UPDATE massif suppression compte → ✅ Plan v2 table anonymized_users INSERT (Sprint 1B)
- ❌ Plan v1 : email provider single-point-of-failure → ✅ Plan v2 abstraction swappable + fallback inline link
- ❌ Plan v1 : Sprint atomique 22 tâches 5-7j → ✅ Plan v2 1A 13 tâches 3-4j + 1B 8 tâches 3j
- ❌ Plan v1 : tests E2E manuels seulement → ✅ Plan v2 Playwright PIN flow skip-by-default

### Décisions à confirmer en cours d'exécution
- Provider email Resend ou Postmark (1B, pas bloquant 1A grâce au stub)
- DPO email `dpo@maia.app` à provisionner (mentionné dans drafts)
- Forme juridique Maïa SARL/SRL BE (placeholder dans drafts à compléter)
- Bcryptjs OK en middleware (B2 vérifie au moment de l'exécution)

---

## Execution Handoff

**Plan lean prêt.** Démarrage Phase A immédiat. Commits successifs au fil de l'eau (~12-13 tâches, ~3-4 jours). Checkpoint après Phase C (PIN flow complet) pour test local par Alex avant Phase D/E1/F1.
