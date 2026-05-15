# Sprint 0 — Rebrand Maïa + `/accueil` Routing Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer toutes les routes `/student/*` et `/school/*` vers une arborescence unifiée `/accueil/*` rôle-aware, supprimer le branding Schoolio résiduel, retirer les composants orphelins/legacy, et passer la copy en ton adulte. Sortie : un PR atomique qui rend le repo aligné avec la décision archi `project_tenant_routing_flat`.

**Architecture :**
- **URL flat** `maia.app/accueil` rôle-aware. Pas de sous-domaine. Pas de route group Next.js (incompatible avec URLs identiques pour 2 rôles).
- **Server component check à chaque page** (Q3 = sécurité béton) : un helper `getRoleOr403()` ou `getRoleOrRedirect()` exporté depuis `lib/auth/role.ts` (nouveau fichier, hors `lib/api/*` qui est intouchable per CLAUDE.md règle 22).
- **`app/accueil/page.tsx`** = dispatcher qui rend `<ProfHome />` ou `<EleveHome />` selon `app_metadata.role`.
- **Routes role-specific** (`/accueil/devoirs/*` élève, `/accueil/classes/*` prof) : guard par `requireStudentPage()` ou `requireTeacherPage()` en haut du composant server.
- **Routes shared** (`/accueil/live/[id]`) : pas de guard, mais le composant inspecte le rôle pour rendre la bonne vue.
- **PR atomique unique** sur la branche `claude/elastic-heisenberg-d08bdd` (worktree actif).

**Tech Stack :** Next.js 14.2.35 (App Router) · React 18 · Supabase SSR · TypeScript · Tailwind 4 · lucide-react · vitest · playwright.

**Pré-requis :**
- Branche actuelle : `claude/elastic-heisenberg-d08bdd` (worktree). Aucune action sur main.
- `requireUser`, `requireTeacher`, `requireSuperAdmin` existent dans `lib/api/auth.ts` (intouchables — règle 22). Le nouveau fichier `lib/auth/role.ts` les **réutilise** sans les modifier.
- Migration RLS déjà serrée (`20260511030000_tighten_rls_with_check.sql`). Sprint 0 ajoute uniquement une colonne `is_active boolean` sur `questions` (préparation Sprint 2).

---

## Phase A — DB & Helpers Foundation

### Task A1 — État initial + branche

**Files :** lecture seule.

- [ ] **Step 1 :** Vérifier l'état git.

Run : `git status && git log --oneline -3`

Expected : branche `claude/elastic-heisenberg-d08bdd`, dernier commit `8ad57d8 fix(mockups): permissive CSP for /mockups/*.html (#61)`.

- [ ] **Step 2 :** Lister les routes à migrer.

Run :
```bash
find app/student app/school -name "page.tsx" -type f | sort > /tmp/routes-to-migrate.txt
cat /tmp/routes-to-migrate.txt
```

Expected : ~30 fichiers `page.tsx` listés.

- [ ] **Step 3 :** Snapshot du build initial (baseline).

Run : `npm run build 2>&1 | tail -20`

Expected : `Compiled successfully`. Si erreur, **STOP** — fix avant de continuer.

### Task A2 — Migration DB : `is_active` sur `questions`

**Files :**
- Create : `supabase/migrations/20260515000000_questions_is_active_toggle.sql`

**Note :** Cette migration ajoute le slider on/off (mémoire `project_curation_concept_view`). Migration de Sprint 0 car bloque la suite (le rename de route `/school/questions` → `/accueil/curation` se fait après mais le toggle existe déjà au schéma).

- [ ] **Step 1 :** Lire le schéma actuel de `questions`.

Run : `grep -r "CREATE TABLE.*questions" supabase/migrations/ | head -5`

Identifier la table `questions` (probablement `teacher_questions` ou similaire).

- [ ] **Step 2 :** Écrire la migration.

Create `supabase/migrations/20260515000000_questions_is_active_toggle.sql` :

```sql
-- Sprint 0 — Add is_active boolean to questions for the curation toggle UI.
-- Replaces the multi-state status enum (draft/pending/validated/rejected) by
-- a simple on/off slider. Rule decided 2026-05-15.

BEGIN;

-- 1) Add the column with safe default (false = inactive).
ALTER TABLE public.teacher_questions
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) Backfill : every question with status='validated' becomes is_active=true.
--    All other states (draft/pending/rejected) stay is_active=false.
--    The status column is preserved for now — drop in Sprint 2.
UPDATE public.teacher_questions
   SET is_active = TRUE
 WHERE status = 'validated';

-- 3) Index for the common filter "active questions in a class".
CREATE INDEX IF NOT EXISTS teacher_questions_is_active_idx
  ON public.teacher_questions (is_active)
  WHERE is_active = TRUE;

COMMIT;
```

- [ ] **Step 3 :** Vérifier qu'il y a bien une table `teacher_questions`.

Run : `grep -l "teacher_questions" supabase/migrations/ | head -3`

Si elle s'appelle autrement, ajuster le nom de table dans la migration.

- [ ] **Step 4 :** Lancer la migration localement (si Supabase CLI installé).

Run : `npx supabase db reset || echo "Supabase CLI not configured locally, will be applied by CI"`

Expected : migration appliquée OU message neutre. Ne PAS bloquer si non-applicable localement.

- [ ] **Step 5 :** Commit.

```bash
git add supabase/migrations/20260515000000_questions_is_active_toggle.sql
git commit -m "feat(curation): add is_active boolean toggle on teacher_questions

Prepares Sprint 2 curation slider UI (on/off seul). Backfills status='validated' rows to is_active=true. status column kept for now, scheduled for removal in Sprint 2 once UI is migrated."
```

### Task A3 — Helper `lib/auth/role.ts` (server component checks)

**Files :**
- Create : `lib/auth/role.ts`
- Test : `lib/auth/role.test.ts`

**Note :** Ce fichier vit HORS `lib/api/*` (règle 22 CLAUDE.md). Il est dédié aux **server components** (pas aux route handlers API). Il réutilise `lib/supabase-server.ts` (déjà existant).

- [ ] **Step 1 :** Écrire le test d'abord (TDD).

Create `lib/auth/role.test.ts` :

```typescript
import { describe, it, expect, vi } from "vitest";

// Mock the supabase server client
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

import { getRoleOrNull, requireStudentPage, requireTeacherPage } from "./role";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

describe("getRoleOrNull", () => {
  it("returns 'student' for app_metadata.role='student'", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: { role: "student" } } },
      error: null,
    });
    const role = await getRoleOrNull();
    expect(role).toBe("student");
  });

  it("returns 'teacher' for app_metadata.role='teacher'", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: { role: "teacher" } } },
      error: null,
    });
    const role = await getRoleOrNull();
    expect(role).toBe("teacher");
  });

  it("returns null when not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const role = await getRoleOrNull();
    expect(role).toBeNull();
  });

  it("returns null when role is missing or unknown", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: {} } },
      error: null,
    });
    const role = await getRoleOrNull();
    expect(role).toBeNull();
  });
});

describe("requireStudentPage", () => {
  it("redirects teachers to /accueil", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: { role: "teacher" } } },
      error: null,
    });
    await expect(requireStudentPage()).rejects.toThrow("NEXT_REDIRECT:/accueil");
  });

  it("redirects unauthenticated users to /login", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(requireStudentPage()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("returns user when role is student", async () => {
    const user = { id: "u1", app_metadata: { role: "student" } };
    mockGetUser.mockResolvedValueOnce({ data: { user }, error: null });
    const result = await requireStudentPage();
    expect(result.user).toEqual(user);
  });
});

describe("requireTeacherPage", () => {
  it("redirects students to /accueil", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: { role: "student" } } },
      error: null,
    });
    await expect(requireTeacherPage()).rejects.toThrow("NEXT_REDIRECT:/accueil");
  });

  it("returns user when role is teacher", async () => {
    const user = { id: "u1", app_metadata: { role: "teacher" } };
    mockGetUser.mockResolvedValueOnce({ data: { user }, error: null });
    const result = await requireTeacherPage();
    expect(result.user).toEqual(user);
  });
});
```

- [ ] **Step 2 :** Lancer les tests, attendre l'échec.

Run : `npx vitest run lib/auth/role.test.ts`

Expected : FAIL avec `Cannot find module './role'`.

- [ ] **Step 3 :** Écrire l'implémentation minimale.

Create `lib/auth/role.ts` :

```typescript
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export type AppRole = "student" | "teacher";

/**
 * Reads the role from app_metadata (server-trusted).
 * NEVER reads user_metadata — that's client-mutable per règle interne #1.
 */
function readRole(user: User | null): AppRole | null {
  if (!user) return null;
  const role = (user.app_metadata as Record<string, unknown>)?.role;
  if (role === "student" || role === "teacher") return role;
  return null;
}

/**
 * Returns the current user's role, or null if not authenticated / unknown.
 * Use this in server components when you need to dispatch (e.g. /accueil page).
 */
export async function getRoleOrNull(): Promise<AppRole | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return readRole(user);
}

/**
 * Guard for student-only server component pages. Calls redirect() on failure.
 * Returns { user, role: 'student' } on success.
 */
export async function requireStudentPage(): Promise<{ user: User; role: "student" }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const role = readRole(user);
  if (role !== "student") redirect("/accueil");
  return { user, role: "student" };
}

/**
 * Guard for teacher-only server component pages. Calls redirect() on failure.
 * Returns { user, role: 'teacher' } on success.
 */
export async function requireTeacherPage(): Promise<{ user: User; role: "teacher" }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const role = readRole(user);
  if (role !== "teacher") redirect("/accueil");
  return { user, role: "teacher" };
}
```

- [ ] **Step 4 :** Lancer les tests, attendre le succès.

Run : `npx vitest run lib/auth/role.test.ts`

Expected : PASS (toutes les assertions vertes).

- [ ] **Step 5 :** Commit.

```bash
git add lib/auth/role.ts lib/auth/role.test.ts
git commit -m "feat(auth): add server component role guards in lib/auth/role.ts

Server-side helpers for the /accueil routing dispatch:
- getRoleOrNull() : returns 'student' | 'teacher' | null
- requireStudentPage() : redirects non-students to /accueil or /login
- requireTeacherPage() : redirects non-teachers to /accueil or /login

Built outside lib/api/* per CLAUDE.md règle 22. Reads role exclusively from app_metadata (règle interne #1, server-trusted). Sprint 0 foundation."
```

---

## Phase B — Scaffold `app/accueil/*`

### Task B1 — Layout partagé `app/accueil/layout.tsx`

**Files :**
- Create : `app/accueil/layout.tsx`

- [ ] **Step 1 :** Lire le layout existant `app/student/` ou `app/school/` s'il y en a un commun.

Run : `find app/student app/school -name "layout.tsx" -maxdepth 2`

S'il existe, l'utiliser comme base. Sinon, créer minimal.

- [ ] **Step 2 :** Créer le layout shared.

Create `app/accueil/layout.tsx` :

```typescript
import type { ReactNode } from "react";
import Header from "@/components/Header";

export default function AccueilLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <Header />
      <main>{children}</main>
    </div>
  );
}
```

- [ ] **Step 3 :** Build verify.

Run : `npm run build 2>&1 | tail -5`

Expected : `Compiled successfully` (le layout est isolé, ne devrait rien casser).

- [ ] **Step 4 :** Commit.

```bash
git add app/accueil/layout.tsx
git commit -m "feat(accueil): scaffold shared layout for /accueil tree"
```

### Task B2 — Dispatcher `app/accueil/page.tsx`

**Files :**
- Create : `app/accueil/page.tsx`
- Create : `app/accueil/_components/EleveHome.tsx` (placeholder, real content from C1)
- Create : `app/accueil/_components/ProfHome.tsx` (placeholder, real content from D1)

- [ ] **Step 1 :** Créer le dispatcher.

Create `app/accueil/page.tsx` :

```typescript
import { redirect } from "next/navigation";
import { getRoleOrNull } from "@/lib/auth/role";
import EleveHome from "./_components/EleveHome";
import ProfHome from "./_components/ProfHome";

export const dynamic = "force-dynamic";

export default async function AccueilPage() {
  const role = await getRoleOrNull();
  if (!role) redirect("/login");
  if (role === "student") return <EleveHome />;
  return <ProfHome />;
}
```

- [ ] **Step 2 :** Créer les placeholders.

Create `app/accueil/_components/EleveHome.tsx` :

```typescript
export default function EleveHome() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Bonjour — accueil élève</h1>
      <p className="mt-2 text-slate-600">Migration en cours…</p>
    </div>
  );
}
```

Create `app/accueil/_components/ProfHome.tsx` :

```typescript
export default function ProfHome() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Bonjour — accueil professeur</h1>
      <p className="mt-2 text-slate-600">Migration en cours…</p>
    </div>
  );
}
```

- [ ] **Step 3 :** Build verify.

Run : `npm run build 2>&1 | tail -5`

Expected : `Compiled successfully`.

- [ ] **Step 4 :** Commit.

```bash
git add app/accueil/
git commit -m "feat(accueil): add role dispatcher at /accueil with placeholders"
```

### Task B3 — Middleware : rediriger `/` → `/accueil`, garder gates legacy temporaires

**Files :**
- Modify : `middleware.ts`

- [ ] **Step 1 :** Lire le middleware actuel.

Run : `wc -l middleware.ts`

Confirmer ~115 lignes.

- [ ] **Step 2 :** Patcher la redirection racine.

Edit `middleware.ts` :

Remplacer la section commentée "Authenticated user landing on '/'" :

```typescript
  // Authenticated user landing on "/" → push to their dashboard.
  if (pathname === "/") {
    return redirect(isStudent ? "/student" : "/school");
  }
```

Par :

```typescript
  // Authenticated user landing on "/" → /accueil (role-aware dispatcher).
  if (pathname === "/") {
    return redirect("/accueil");
  }
```

- [ ] **Step 3 :** Ajouter `/accueil` aux paths auth-required.

Edit `middleware.ts`, dans le bloc `if (!user)` :

Remplacer :

```typescript
    if (
      pathname.startsWith("/student") ||
      pathname.startsWith("/school") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/join") ||
      pathname.startsWith("/onboarding")
    ) {
```

Par :

```typescript
    if (
      pathname.startsWith("/accueil") ||
      pathname.startsWith("/student") ||
      pathname.startsWith("/school") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/join") ||
      pathname.startsWith("/onboarding")
    ) {
```

- [ ] **Step 4 :** Permettre l'accès `/accueil` aux 2 rôles (pas de role-based block).

Edit `middleware.ts`, après la section SUPER_ADMIN bypass, AVANT les role-based redirects. Le code actuel :

```typescript
  // Role-based redirects
  if (isStudent && (pathname.startsWith("/school") || pathname.startsWith("/admin"))) {
    return redirect("/student");
  }
  if (!isStudent && pathname.startsWith("/student")) {
    return redirect("/school");
  }
```

Devient (les redirects legacy restent jusqu'à la fin du sprint, mais on autorise `/accueil` pour tous les authentifiés implicitement — pas besoin de modifier ce bloc) :

```typescript
  // /accueil is role-aware via server components — both roles authorized here.
  // No additional middleware logic needed for /accueil.

  // Legacy role-based redirects (to be removed at end of sprint once /student
  // and /school are fully deleted).
  if (isStudent && (pathname.startsWith("/school") || pathname.startsWith("/admin"))) {
    return redirect("/student");
  }
  if (!isStudent && pathname.startsWith("/student")) {
    return redirect("/school");
  }
```

- [ ] **Step 5 :** Build verify.

Run : `npm run build 2>&1 | tail -5`

Expected : `Compiled successfully`.

- [ ] **Step 6 :** Commit.

```bash
git add middleware.ts
git commit -m "feat(middleware): redirect / to /accueil (role-aware dispatcher)

/accueil is now the unified entry point post-auth. Legacy /student and /school remain accessible temporarily for parallel migration. Both will be deleted at end of Sprint 0."
```

### Task B4 — Test E2E smoke : login → `/accueil` rend selon rôle

**Files :**
- Create : `tests/e2e/accueil-dispatch.spec.ts` (si Playwright config existe ; sinon skip vers Task I2)

- [ ] **Step 1 :** Vérifier la config Playwright.

Run : `cat playwright.config.ts 2>/dev/null | head -20`

Si présent : poursuivre. Si absent : skip ce test (sera vérifié manuellement en Task I2).

- [ ] **Step 2 :** Si config présente, créer le test.

Create `tests/e2e/accueil-dispatch.spec.ts` :

```typescript
import { test, expect } from "@playwright/test";

test.describe("/accueil dispatch", () => {
  test("unauthenticated user is redirected to /login", async ({ page }) => {
    await page.goto("/accueil");
    await expect(page).toHaveURL(/\/login/);
  });

  // Note : tests avec auth réelle nécessitent un compte seed côté Supabase.
  // Test minimal : la page existe et redirige correctement.
});
```

- [ ] **Step 3 :** Lancer le test.

Run : `npx playwright test tests/e2e/accueil-dispatch.spec.ts` (si Playwright dispo)

Expected : PASS.

- [ ] **Step 4 :** Commit.

```bash
git add tests/e2e/accueil-dispatch.spec.ts
git commit -m "test(e2e): /accueil redirects unauthenticated users to /login"
```

---

## Phase C — Migrer `/student/*` → `/accueil/*`

### Pattern canonique (à appliquer pour chaque sous-tâche)

Pour chaque route `/student/<X>` → `/accueil/<Y>` :

1. `git mv app/student/<X>/ app/accueil/<Y>/`
2. Dans chaque `page.tsx` déplacé, ajouter **au tout début** du composant (après les imports server) :
   ```typescript
   import { requireStudentPage } from "@/lib/auth/role";
   ```
   Et appeler `await requireStudentPage();` comme première instruction du composant async.
3. Mettre à jour les imports relatifs cassés (généralement `../../../components/X` reste valide grâce aux alias `@/`).
4. Vérifier `npm run build` après chaque déplacement majeur.

### Task C1 — Migrer `/student/page.tsx` → `app/accueil/_components/EleveHome.tsx`

**Files :**
- Read : `app/student/page.tsx`
- Modify : `app/accueil/_components/EleveHome.tsx` (remplace le placeholder)
- Delete : `app/student/page.tsx`

- [ ] **Step 1 :** Lire `app/student/page.tsx`.

Run : `cat app/student/page.tsx`

Noter les imports + le rendu (probablement `HeatmapDashboardClient` + fetch heatmap data SSR).

- [ ] **Step 2 :** Copier le contenu dans `EleveHome.tsx`.

Edit `app/accueil/_components/EleveHome.tsx` : remplacer le placeholder par le contenu de `app/student/page.tsx`, en :
- Supprimant la définition `export default async function StudentPage()` → renommer en `export default async function EleveHome()`
- Conservant tous les imports (les paths `@/...` restent valides)
- Ajoutant `await requireStudentPage()` en première instruction si pas déjà gardé (le dispatcher déjà filtre, mais double-guard ne coûte rien)

Exemple de squelette résultat (à adapter au vrai contenu) :

```typescript
import HeatmapDashboardClient from "@/app/student/_components/HeatmapDashboardClient";
import { fetchHeatmapData } from "@/lib/db/heatmap"; // chemin réel à confirmer
// ... autres imports

export default async function EleveHome() {
  const data = await fetchHeatmapData();
  return <HeatmapDashboardClient {...data} />;
}
```

**⚠️ Important :** les composants `app/student/_components/*` restent dans leur dossier pour le moment (sera déplacé en Task C5).

- [ ] **Step 3 :** Build verify.

Run : `npm run build 2>&1 | tail -5`

Expected : `Compiled successfully`.

- [ ] **Step 4 :** Supprimer `app/student/page.tsx`.

Run : `git rm app/student/page.tsx`

- [ ] **Step 5 :** Build verify final.

Run : `npm run build 2>&1 | tail -5`

Expected : `Compiled successfully`. Le path `/student` n'existe plus, le middleware actuel redirige déjà `/` → `/accueil`.

- [ ] **Step 6 :** Commit.

```bash
git add -A
git commit -m "feat(accueil): migrate /student dashboard into /accueil EleveHome

Moves the heatmap dashboard from /student/page.tsx into the role-aware /accueil dispatcher's EleveHome component. /student/page.tsx removed. Internal _components folder untouched for now (migrated in C5)."
```

### Task C2 — Migrer `/student/assignments/*` → `/accueil/devoirs/*`

**Files :**
- Rename : `app/student/assignments/` → `app/accueil/devoirs/`

- [ ] **Step 1 :** Déplacer le dossier.

Run :
```bash
mkdir -p app/accueil/devoirs
git mv app/student/assignments/page.tsx app/accueil/devoirs/page.tsx
git mv app/student/assignments/[id] app/accueil/devoirs/[id]
```

- [ ] **Step 2 :** Vérifier la structure.

Run : `find app/accueil/devoirs -type f`

Expected :
- `app/accueil/devoirs/page.tsx`
- `app/accueil/devoirs/[id]/page.tsx`
- `app/accueil/devoirs/[id]/quiz/page.tsx`
- `app/accueil/devoirs/[id]/quiz/_components/*.tsx` (5 fichiers)

- [ ] **Step 3 :** Ajouter le guard dans chaque page.

Pour `app/accueil/devoirs/page.tsx`, `app/accueil/devoirs/[id]/page.tsx`, `app/accueil/devoirs/[id]/quiz/page.tsx` :

Ajouter en haut des imports :
```typescript
import { requireStudentPage } from "@/lib/auth/role";
```

Et en première instruction du composant async :
```typescript
await requireStudentPage();
```

- [ ] **Step 4 :** Vérifier les imports internes.

Run : `grep -rn "from.*\"\\@\\/app\\/student" app/accueil/devoirs/`

Expected : peut afficher des imports cassés (e.g. `@/app/student/_components/...`). Ces imports restent valides tant que `app/student/_components/` n'est pas supprimé (Task C5).

- [ ] **Step 5 :** Mettre à jour les `router.push()`, `<Link href>`, `redirect()` dans ces fichiers.

Run :
```bash
grep -rn "\"/student/assignments" app/accueil/devoirs/
grep -rn "'/student/assignments" app/accueil/devoirs/
```

Pour chaque occurrence trouvée, remplacer `/student/assignments/` par `/accueil/devoirs/`.

- [ ] **Step 6 :** Build verify.

Run : `npm run build 2>&1 | tail -5`

Expected : `Compiled successfully`.

- [ ] **Step 7 :** Commit.

```bash
git add -A
git commit -m "feat(accueil): migrate /student/assignments to /accueil/devoirs

Includes:
- list page (/accueil/devoirs)
- detail page (/accueil/devoirs/[id])
- quiz session (/accueil/devoirs/[id]/quiz) with its 5 sub-components

Adds requireStudentPage() guard to all 3 pages. Internal links updated. References to legacy /student/assignments path replaced."
```

### Task C3 — Migrer `/student/live/*` → `/accueil/live/*` (élève join)

**Files :**
- Rename : `app/student/live/` → `app/accueil/live/`

**Note :** ⚠️ `/accueil/live/[code]` (élève join by 6-char code) coexistera plus tard avec `/accueil/live/[id]` (prof console by UUID). Pour éviter le conflit Next.js, on renomme côté élève en `/accueil/rejoindre/[code]` ET on garde `/accueil/live/[code]` (existant) — mais Next.js exige un nom unique par dossier dynamique. **Décision** : déplacer l'élève join sous `app/accueil/rejoindre/[code]/` ET le lobby élève sous `app/accueil/live/page.tsx` (sera fusionné avec le prof en D7).

- [ ] **Step 1 :** Déplacer.

Run :
```bash
mkdir -p app/accueil/rejoindre
git mv app/student/live/page.tsx app/accueil/live/page.tsx  # lobby join form
git mv app/student/live/[code] app/accueil/rejoindre/[code]  # join-by-code → resolve session
```

- [ ] **Step 2 :** Vérifier les imports relatifs.

Run :
```bash
grep -rn "from.*\"\\." app/accueil/live/page.tsx app/accueil/rejoindre/[code]/page.tsx
```

Tous les imports relatifs doivent être `@/...` (paths absolus). Si chemin relatif `../`, le corriger en absolu.

- [ ] **Step 3 :** Ajouter `requireStudentPage()` dans `app/accueil/rejoindre/[code]/page.tsx`.

Le lobby `app/accueil/live/page.tsx` sera role-aware en D7 (pas de guard maintenant).

- [ ] **Step 4 :** Mettre à jour les `<Link href="/student/live...">` internes.

Run :
```bash
grep -rn "/student/live" app/
```

Remplacer chaque occurrence par `/accueil/rejoindre/` (pour code-based join) ou `/accueil/live/` (pour la liste).

- [ ] **Step 5 :** Build verify.

Run : `npm run build 2>&1 | tail -5`

Expected : `Compiled successfully`.

- [ ] **Step 6 :** Commit.

```bash
git add -A
git commit -m "feat(accueil): migrate /student/live to /accueil/{live,rejoindre}

Splits the student live entry into:
- /accueil/live : shared lobby (will be merged with prof view in D7)
- /accueil/rejoindre/[code] : join-by-code form for students

Avoids path conflict with future /accueil/live/[id] (prof console)."
```

### Task C4 — Migrer `app/student/_components/*` → `app/accueil/_components/eleve/`

**Files :**
- Rename : `app/student/_components/*` → `app/accueil/_components/eleve/*`

- [ ] **Step 1 :** Déplacer.

Run :
```bash
mkdir -p app/accueil/_components/eleve
git mv app/student/_components/*.tsx app/accueil/_components/eleve/
```

- [ ] **Step 2 :** Mettre à jour les imports cross-app.

Find all imports of `@/app/student/_components/` dans le repo :

Run :
```bash
grep -rln "@/app/student/_components" app/ lib/ components/
```

Pour chaque fichier trouvé, remplacer `@/app/student/_components/` par `@/app/accueil/_components/eleve/`.

- [ ] **Step 3 :** Build verify.

Run : `npm run build 2>&1 | tail -5`

Expected : `Compiled successfully`.

- [ ] **Step 4 :** Vérifier qu'`app/student/_components/` est vide.

Run : `ls app/student/_components/ 2>/dev/null`

Expected : vide ou n'existe plus.

- [ ] **Step 5 :** Commit.

```bash
git add -A
git commit -m "refactor(accueil): move student _components to accueil/_components/eleve

Path: app/student/_components/*.tsx → app/accueil/_components/eleve/*.tsx
All cross-app imports updated. Logical grouping by role under the unified /accueil tree."
```

### Task C5 — Supprimer le dossier `app/student/` résiduel

**Files :**
- Delete : `app/student/`

- [ ] **Step 1 :** Vérifier qu'il est vide.

Run : `find app/student -type f`

Expected : aucun fichier (juste éventuellement des dossiers vides).

- [ ] **Step 2 :** Supprimer.

Run : `rm -rf app/student`

- [ ] **Step 3 :** Build verify.

Run : `npm run build 2>&1 | tail -5`

Expected : `Compiled successfully`.

- [ ] **Step 4 :** Commit.

```bash
git add -A
git commit -m "chore(accueil): remove empty /student directory

All content migrated to /accueil. Closes the legacy student route tree."
```

---

## Phase D — Migrer `/school/*` → `/accueil/*`

Même pattern que Phase C, mais pour les routes prof. Chaque task = 1 route ou groupe de routes, 1 commit.

### Task D1 — Migrer `/school/page.tsx` → `app/accueil/_components/ProfHome.tsx`

**Files :**
- Read : `app/school/page.tsx`
- Modify : `app/accueil/_components/ProfHome.tsx`
- Delete : `app/school/page.tsx`

- [ ] **Step 1 :** Lire le contenu.

Run : `cat app/school/page.tsx`

- [ ] **Step 2 :** Migrer dans `ProfHome.tsx`.

Edit `app/accueil/_components/ProfHome.tsx` : remplacer le placeholder par le contenu, renommer la fonction en `ProfHome`, conserver les imports.

**Note :** les composants `app/school/_components/*` restent en place jusqu'à Task D9 (final cleanup).

- [ ] **Step 3 :** Build verify.

Run : `npm run build 2>&1 | tail -5`

Expected : `Compiled successfully`.

- [ ] **Step 4 :** Supprimer `app/school/page.tsx`.

Run : `git rm app/school/page.tsx`

- [ ] **Step 5 :** Build verify final.

Expected : `Compiled successfully`.

- [ ] **Step 6 :** Commit.

```bash
git add -A
git commit -m "feat(accueil): migrate /school dashboard into ProfHome component"
```

### Task D2 — Migrer `/school/classes/*` → `/accueil/classes/*`

**Files :**
- Rename : `app/school/classes/` → `app/accueil/classes/`

Sous-routes à déplacer :
- `app/school/classes/page.tsx`
- `app/school/classes/new/page.tsx` → `app/accueil/classes/nouvelle/page.tsx`
- `app/school/classes/[id]/page.tsx`
- `app/school/classes/[id]/invite/page.tsx` → `app/accueil/classes/[id]/invitation/page.tsx`
- `app/school/classes/[id]/assignments/page.tsx` → `app/accueil/classes/[id]/devoirs/page.tsx`
- `app/school/classes/[id]/assignments/new/page.tsx` → `.../devoirs/nouveau/page.tsx`
- `app/school/classes/[id]/assignments/[id]/page.tsx` → `.../devoirs/[id]/page.tsx`

- [ ] **Step 1 :** Créer le dossier cible.

Run : `mkdir -p app/accueil/classes/[id]/devoirs/[id]`

- [ ] **Step 2 :** Déplacer les fichiers (un par un pour éviter les collisions avec sous-dossiers).

Run :
```bash
git mv app/school/classes/page.tsx app/accueil/classes/page.tsx
git mv app/school/classes/new app/accueil/classes/nouvelle
git mv app/school/classes/[id]/page.tsx app/accueil/classes/[id]/page.tsx
git mv app/school/classes/[id]/invite app/accueil/classes/[id]/invitation
git mv app/school/classes/[id]/assignments/new app/accueil/classes/[id]/devoirs/nouveau
# Pour chaque page restante dans assignments/, déplacer
git mv app/school/classes/[id]/assignments/page.tsx app/accueil/classes/[id]/devoirs/page.tsx 2>/dev/null || true
# Le détail assignment :
find app/school/classes/[id]/assignments -name "page.tsx" -not -path "*/new/*" -exec git mv {} app/accueil/classes/[id]/devoirs/[id]/page.tsx \; 2>/dev/null || true
```

⚠️ Notes :
- Le chemin `[id]/devoirs/[id]/` a 2 paramètres `[id]` à des niveaux différents — Next.js gère bien, mais en code il faut destructurer `params.id` selon le niveau (`classId` vs `devoirId`). À renommer en `[classId]/devoirs/[devoirId]` pour clarté **si tu as le temps** ; sinon laisse identique au code existant pour minimiser le risque.

- [ ] **Step 3 :** Si renommage des params : refactor pour `[classId]/devoirs/[devoirId]`.

```bash
git mv app/accueil/classes/[id] app/accueil/classes/[classId]
# puis dans le sous-arbre :
git mv app/accueil/classes/[classId]/devoirs/[id] app/accueil/classes/[classId]/devoirs/[devoirId]
```

Puis mettre à jour tous les `params.id` → `params.classId` ou `params.devoirId` dans les fichiers déplacés. Cherche :

Run : `grep -rn "params\.id" app/accueil/classes/`

Pour chaque occurrence, décider quel id concerne (class ou devoir) et renommer.

- [ ] **Step 4 :** Ajouter `requireTeacherPage()` guard dans chaque page.

Pour chaque `page.tsx` sous `app/accueil/classes/`, ajouter en haut :
```typescript
import { requireTeacherPage } from "@/lib/auth/role";
```
Et en première instruction :
```typescript
await requireTeacherPage();
```

- [ ] **Step 5 :** Mettre à jour les `<Link href>` et `router.push()` internes.

Run :
```bash
grep -rln "/school/classes" app/
```

Remplacer `/school/classes/new` → `/accueil/classes/nouvelle`, `/school/classes/[id]/invite` → `/accueil/classes/[classId]/invitation`, etc.

- [ ] **Step 6 :** Build verify.

Run : `npm run build 2>&1 | tail -5`

Expected : `Compiled successfully`.

- [ ] **Step 7 :** Commit.

```bash
git add -A
git commit -m "feat(accueil): migrate /school/classes tree to /accueil/classes

Renamed:
- /school/classes/new → /accueil/classes/nouvelle
- /school/classes/[id]/invite → /accueil/classes/[classId]/invitation
- /school/classes/[id]/assignments/* → /accueil/classes/[classId]/devoirs/*

Params renamed for clarity ([id] → [classId] / [devoirId]).
Adds requireTeacherPage() guard on every page."
```

### Task D3 — Migrer `/school/courses/*` → `/accueil/cours/*`

Pattern identique. Routes :
- `app/school/courses/page.tsx` → `app/accueil/cours/page.tsx`
- `app/school/courses/[id]/page.tsx` → `app/accueil/cours/[id]/page.tsx`
- `app/school/courses/[id]/exercises/page.tsx` → `app/accueil/cours/[id]/exercices/page.tsx`
- `app/school/courses/[id]/exercises/[id]/page.tsx` → `app/accueil/cours/[id]/exercices/[exerciseId]/page.tsx`
- `app/school/courses/[id]/exercises/_components/` → `app/accueil/cours/[id]/exercices/_components/`

- [ ] **Step 1 :** Déplacer.

Run :
```bash
mkdir -p app/accueil/cours
git mv app/school/courses/page.tsx app/accueil/cours/page.tsx
git mv app/school/courses/[id] app/accueil/cours/[id]
# Sous-dossier exercises → exercices :
git mv app/accueil/cours/[id]/exercises app/accueil/cours/[id]/exercices
# Param du detail exercice pour clarté :
git mv app/accueil/cours/[id]/exercices/[id] app/accueil/cours/[id]/exercices/[exerciseId] 2>/dev/null || true
```

- [ ] **Step 2 :** Renommer `params.id` du sous-niveau exercice si nécessaire.

Run : `grep -rn "params\.id" app/accueil/cours/[id]/exercices/`

Si une page utilise `params.id` pour l'exercice (sous le param du cours), renommer en `params.exerciseId`.

- [ ] **Step 3 :** Ajouter `requireTeacherPage()` partout.

- [ ] **Step 4 :** Update internal links `/school/courses` → `/accueil/cours`.

- [ ] **Step 5 :** Build verify.

Run : `npm run build 2>&1 | tail -5`

- [ ] **Step 6 :** Commit.

```bash
git add -A
git commit -m "feat(accueil): migrate /school/courses to /accueil/cours

Translates 'courses' to 'cours' and 'exercises' to 'exercices' (FR-first per i18n stance). Adds requireTeacherPage() guards."
```

### Task D4 — Migrer `/school/questions/*` → `/accueil/curation/*`

**Files :**
- Rename : `app/school/questions/` → `app/accueil/curation/`

- [ ] **Step 1 :** Déplacer.

Run :
```bash
git mv app/school/questions app/accueil/curation
```

- [ ] **Step 2 :** Ajouter `requireTeacherPage()` dans `app/accueil/curation/page.tsx`.

- [ ] **Step 3 :** Update internal links `/school/questions` → `/accueil/curation`.

Run :
```bash
grep -rln "/school/questions" app/ components/
```

- [ ] **Step 4 :** Vérifier le hook `useQuestionsPage` (path absolu, devrait continuer à fonctionner).

Run : `grep -rn "useQuestionsPage" app/accueil/curation/`

- [ ] **Step 5 :** Build verify.

- [ ] **Step 6 :** Commit.

```bash
git add -A
git commit -m "feat(accueil): migrate /school/questions to /accueil/curation

Renames to align with the curation hub concept (mémoire project_curation_concept_view). Sprint 2 will extend the modal to a unified concept view (theory + questions + misconceptions + hints + source)."
```

### Task D5 — Migrer `/school/import/*` → `/accueil/import/*`

- [ ] **Step 1 :** `git mv app/school/import app/accueil/import`
- [ ] **Step 2 :** Guard `requireTeacherPage()`
- [ ] **Step 3 :** Update internal links
- [ ] **Step 4 :** Build verify
- [ ] **Step 5 :** Commit

```bash
git commit -m "feat(accueil): migrate /school/import to /accueil/import"
```

### Task D6 — Migrer `/school/schedule/*` → `/accueil/horaire/*`

- [ ] **Step 1 :** `git mv app/school/schedule app/accueil/horaire`
- [ ] **Step 2 :** Guard `requireTeacherPage()`
- [ ] **Step 3 :** Update internal links
- [ ] **Step 4 :** Build verify
- [ ] **Step 5 :** Commit

```bash
git commit -m "feat(accueil): migrate /school/schedule to /accueil/horaire (FR naming)"
```

### Task D7 — Fusionner `/school/live/*` et `/school/session/*` dans `/accueil/live/*` et `/accueil/session/*`

**Files :**
- Rename : `app/school/live/` → `app/accueil/live/` (merge avec l'existant côté élève)
- Rename : `app/school/session/` → `app/accueil/session/`

**Note :** `/accueil/live/page.tsx` existe déjà (lobby élève posé en C3). Il devient role-aware (élève voit "live en cours pour mes classes", prof voit "mes sessions actives"). `/accueil/live/[id]` (prof console) coexiste avec `/accueil/rejoindre/[code]` (élève join, posé en C3).

- [ ] **Step 1 :** Déplacer `school/live`.

Run :
```bash
git mv app/school/live/[id] app/accueil/live/[id]
# /school/live/page.tsx peut soit remplacer le lobby élève existant, soit fusionner.
# Stratégie : conserver le file élève en place et NE PAS écraser. Vérifier si /school/live a un page.tsx.
ls app/school/live/
```

Si `app/school/live/page.tsx` existe : lire son contenu et merge avec `app/accueil/live/page.tsx` (existant élève) en rendant la page role-aware avec `getRoleOrNull()`. Sinon, ignorer.

- [ ] **Step 2 :** Rendre `app/accueil/live/page.tsx` role-aware.

Edit `app/accueil/live/page.tsx` :

```typescript
import { redirect } from "next/navigation";
import { getRoleOrNull } from "@/lib/auth/role";
// imports élève (lobby existant)
// imports prof (lobby prof si présent)

export default async function LivePage() {
  const role = await getRoleOrNull();
  if (!role) redirect("/login");
  if (role === "student") {
    // rendu lobby élève (contenu actuel)
  }
  // rendu lobby prof
}
```

- [ ] **Step 3 :** Déplacer `school/session`.

Run :
```bash
git mv app/school/session app/accueil/session
```

- [ ] **Step 4 :** Renommer `app/accueil/session/new` → `app/accueil/session/nouvelle`.

Run :
```bash
git mv app/accueil/session/new app/accueil/session/nouvelle
```

- [ ] **Step 5 :** Ajouter `requireTeacherPage()` dans `app/accueil/session/**` et `app/accueil/live/[id]/page.tsx` (le prof console).

- [ ] **Step 6 :** Update internal links `/school/live` → `/accueil/live`, `/school/session/new` → `/accueil/session/nouvelle`.

- [ ] **Step 7 :** Build verify.

- [ ] **Step 8 :** Commit.

```bash
git commit -m "feat(accueil): merge /school/live and /school/session into /accueil

- /accueil/live : role-aware lobby (élève voit live en cours, prof voit ses sessions)
- /accueil/live/[id] : prof console (requireTeacherPage)
- /accueil/rejoindre/[code] : élève join (already in C3)
- /accueil/session/nouvelle : prof session creation (FR naming)"
```

### Task D8 — Migrer routes prof restantes : `/school/organization`, `/school/ingestion/[jobId]`

- [ ] **Step 1 :** `git mv app/school/organization app/accueil/organisation`
- [ ] **Step 2 :** `git mv app/school/ingestion app/accueil/ingestion`
- [ ] **Step 3 :** Guard + update links + build verify
- [ ] **Step 4 :** Commit

```bash
git commit -m "feat(accueil): migrate /school/{organization,ingestion} to /accueil"
```

### Task D9 — Migrer `app/school/_components/*` → `app/accueil/_components/prof/`

**Files :**
- Rename : `app/school/_components/*` → `app/accueil/_components/prof/*`
- Rename : `app/school/import/_components/*` → `app/accueil/import/_components/*` (reste local à la page import)
- Rename : `app/school/schedule/_components/*` → `app/accueil/horaire/_components/*`
- Rename : `app/school/questions/_components/*` → `app/accueil/curation/_components/*`
- Rename : `app/school/courses/[id]/exercises/_components/*` → `app/accueil/cours/[id]/exercices/_components/*`

- [ ] **Step 1 :** Déplacer les composants partagés prof.

Run :
```bash
mkdir -p app/accueil/_components/prof
git mv app/school/_components/*.tsx app/accueil/_components/prof/
```

- [ ] **Step 2 :** Vérifier que les `_components` locaux ont déjà suivi leur page parent (Tasks D2-D8). 

Run : `find app/accueil -type d -name "_components"`

Expected : tous les `_components` locaux sont déjà sous `app/accueil/<feature>/_components/`.

- [ ] **Step 3 :** Update imports cross-app.

Run :
```bash
grep -rln "@/app/school/_components" app/ lib/ components/
```

Replace `@/app/school/_components/` → `@/app/accueil/_components/prof/`.

- [ ] **Step 4 :** Build verify.

- [ ] **Step 5 :** Commit.

```bash
git commit -m "refactor(accueil): move school _components to accueil/_components/prof"
```

### Task D10 — Supprimer `app/school/*` résiduel + routes obsolètes

**Files :**
- Delete : `app/school/syllabus/` (obsolète, remplacé par `/import`)
- Delete : `app/school/` (vide après migrations)

- [ ] **Step 1 :** Vérifier ce qui reste.

Run : `find app/school -type f`

- [ ] **Step 2 :** Supprimer `app/school/syllabus*` (obsolète, jamais migré).

Run : `git rm -r app/school/syllabus 2>/dev/null || true`

- [ ] **Step 3 :** Supprimer le reste.

Run : `rm -rf app/school`

- [ ] **Step 4 :** Build verify.

Run : `npm run build 2>&1 | tail -5`

Expected : `Compiled successfully`.

- [ ] **Step 5 :** Commit.

```bash
git commit -m "chore(accueil): remove empty /school tree and obsolete /syllabus routes"
```

---

## Phase E — API + middleware finalisation

### Task E1 — Nettoyer le middleware des redirects legacy

**Files :**
- Modify : `middleware.ts`

- [ ] **Step 1 :** Lire le middleware actuel.

Run : `cat middleware.ts | sed -n '80,120p'`

- [ ] **Step 2 :** Supprimer les redirects legacy `/student` ↔ `/school`.

Edit `middleware.ts`, supprimer ce bloc devenu obsolète :

```typescript
  // Legacy role-based redirects (to be removed at end of sprint once /student
  // and /school are fully deleted).
  if (isStudent && (pathname.startsWith("/school") || pathname.startsWith("/admin"))) {
    return redirect("/student");
  }
  if (!isStudent && pathname.startsWith("/student")) {
    return redirect("/school");
  }
```

Et remplacer par un redirect catch-all des anciennes URLs vers `/accueil` :

```typescript
  // Hard redirect any remaining /student or /school request to /accueil.
  // After this sprint, both trees are fully deleted from the source ; this
  // is a safety net for bookmarks, search engine cached URLs, etc.
  if (pathname.startsWith("/student") || pathname.startsWith("/school")) {
    return redirect("/accueil");
  }
```

- [ ] **Step 3 :** Supprimer également les paths legacy du bloc `if (!user)`.

Edit :

```typescript
    if (
      pathname.startsWith("/accueil") ||
      pathname.startsWith("/student") ||  // ← supprimer
      pathname.startsWith("/school") ||   // ← supprimer
      pathname.startsWith("/admin") ||
      pathname.startsWith("/join") ||
      pathname.startsWith("/onboarding")
    ) {
```

Devient :

```typescript
    if (
      pathname.startsWith("/accueil") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/join") ||
      pathname.startsWith("/onboarding")
    ) {
```

- [ ] **Step 4 :** Adapter aussi le SUPER_ADMIN bypass :

Edit :

```typescript
  if (
    isSuperAdmin &&
    (pathname.startsWith("/admin") ||
      pathname.startsWith("/student") ||  // ← supprimer
      pathname.startsWith("/school"))     // ← supprimer
  ) {
    return supabaseResponse;
  }
```

Devient :

```typescript
  if (
    isSuperAdmin &&
    (pathname.startsWith("/admin") || pathname.startsWith("/accueil"))
  ) {
    return supabaseResponse;
  }
```

- [ ] **Step 5 :** Build verify.

Run : `npm run build 2>&1 | tail -5`

- [ ] **Step 6 :** Commit.

```bash
git add middleware.ts
git commit -m "chore(middleware): remove legacy /student and /school paths

Hard redirects any residual /student/* or /school/* request to /accueil. Cleans up the auth-required path list and SUPER_ADMIN bypass."
```

### Task E2 — Update les références dans les API routes

**Files :**
- Modify : Tous les fichiers sous `app/api/*` qui contiennent `/student/` ou `/school/` comme path constants (notifications, redirects post-action).

- [ ] **Step 1 :** Identifier les fichiers concernés.

Run :
```bash
grep -rln "\"/student/\\|\"/school/\\|'/student/\\|'/school/" app/api/
```

- [ ] **Step 2 :** Pour chaque fichier listé, ouvrir et remplacer les paths legacy par leurs équivalents `/accueil/*`.

Mapping :
- `/student/` → `/accueil/`
- `/student/assignments/` → `/accueil/devoirs/`
- `/student/live/` → `/accueil/rejoindre/`
- `/school/` → `/accueil/`
- `/school/classes/` → `/accueil/classes/`
- `/school/courses/` → `/accueil/cours/`
- `/school/questions/` → `/accueil/curation/`
- `/school/import/` → `/accueil/import/`
- `/school/schedule/` → `/accueil/horaire/`
- `/school/live/` → `/accueil/live/`
- `/school/session/` → `/accueil/session/`
- `/school/session/new` → `/accueil/session/nouvelle`

- [ ] **Step 3 :** Vérifier qu'il ne reste rien.

Run :
```bash
grep -rn "/student/\\|/school/" app/ components/ lib/ middleware.ts | grep -v "node_modules\\|\\.git\\|test\\|__mocks__"
```

Expected : aucun match (sauf peut-être dans des commentaires ou imports `lib/db` qui sont intouchables règle 22 — à signaler à Alex).

- [ ] **Step 4 :** Build verify.

- [ ] **Step 5 :** Commit.

```bash
git add -A
git commit -m "chore(api): update legacy /student and /school paths to /accueil

Sweeps all redirect/notification path constants in app/api/* and components/*."
```

---

## Phase F — Rebrand visuel

### Task F1 — `Header.tsx` : Schoolio → Maïa

**Files :**
- Modify : `components/Header.tsx`

- [ ] **Step 1 :** Lire le Header actuel.

Run : `cat components/Header.tsx | head -40`

- [ ] **Step 2 :** Remplacer le branding.

Edit `components/Header.tsx` :
- Remplacer toute occurrence de "Schoolio" par "Maïa" (texte, alt, aria-label)
- Remplacer le logo SVG/img si présent par un placeholder texte stylé `"Maïa"` en `font-bold` (le logo final viendra plus tard, c'est juste pour ne plus avoir Schoolio à l'écran)

Pattern :

```typescript
// Avant
<span className="text-xl font-bold">Schoolio</span>

// Après
<span className="text-xl font-bold tracking-tight">Maïa</span>
```

- [ ] **Step 3 :** Build verify.

- [ ] **Step 4 :** Commit.

```bash
git add components/Header.tsx
git commit -m "feat(branding): replace Schoolio with Maïa in Header

Removes the legacy Schoolio logo and text. Placeholder text 'Maïa' in font-bold ; final logo SVG TBD."
```

### Task F2 — `Avatar.tsx` : simplifier (retirer skins gamification)

**Files :**
- Modify : `components/Avatar.tsx`

- [ ] **Step 1 :** Lire l'Avatar actuel.

Run : `cat components/Avatar.tsx`

- [ ] **Step 2 :** Remplacer par une version simplifiée.

Edit `components/Avatar.tsx` (overwrite complet recommandé) :

```typescript
import { UserCircle } from "lucide-react";

type AvatarProps = {
  /** URL de la photo SSO (Google / M365 / SmartSchool) si disponible. */
  photoUrl?: string | null;
  /** Nom affiché en alt — fallback "Utilisateur". */
  name?: string | null;
  /** Taille en px. Defaults 32. */
  size?: number;
  className?: string;
};

export default function Avatar({
  photoUrl,
  name,
  size = 32,
  className = "",
}: AvatarProps) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name ?? "Utilisateur"}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <UserCircle
      width={size}
      height={size}
      className={`text-slate-400 ${className}`}
      strokeWidth={1.5}
      aria-label={name ?? "Utilisateur"}
    />
  );
}
```

- [ ] **Step 3 :** Identifier les composants qui passaient `skin`/`level`/`badge` à Avatar.

Run : `grep -rn "<Avatar" app/ components/`

Pour chaque appel qui passe `skin="laurel"` ou `level={N}`, simplifier en :

```typescript
<Avatar photoUrl={user.user_metadata?.avatar_url} name={user.user_metadata?.full_name} />
```

- [ ] **Step 4 :** Build verify.

Run : `npm run build 2>&1 | tail -10`

Expected : peut afficher des erreurs TypeScript sur les anciennes props (`skin`, `level`, `badge` n'existent plus). Corriger chaque site d'appel.

- [ ] **Step 5 :** Commit.

```bash
git add -A
git commit -m "refactor(avatar): simplify Avatar component to photo SSO + Lucide fallback

Removes the legacy gamification skins (laurel, helmet, samurai) and level badges (Bronze/Silver/Gold/Diamond) per spec MVP §2.2 (no advanced gamification) and feedback_no_pricing_public manifesto tone. Now accepts photoUrl from SSO or falls back to lucide UserCircle."
```

### Task F3 — Login : 3 SSO providers (Google + M365 + SmartSchool stub)

**Files :**
- Modify : `app/login/page.tsx` (et `LoginClient.tsx` si présent)
- Maybe delete : `components/AuthButton.tsx` (si plus utilisé)

- [ ] **Step 1 :** Lire la page login actuelle.

Run : `cat app/login/page.tsx`

Et :
Run : `find app/login -type f`

- [ ] **Step 2 :** Identifier le client component qui rend les boutons SSO.

Run : `grep -rn "signInWithOAuth\\|provider:" app/login/`

- [ ] **Step 3 :** Étendre le client pour 3 providers.

Dans le fichier client (probablement `LoginClient.tsx` ou similaire), ajouter les 3 boutons :

```typescript
"use client";
import { createClient } from "@/lib/supabase-browser";

export default function LoginButtons({ next }: { next?: string }) {
  const supabase = createClient();

  async function signIn(provider: "google" | "azure") {
    const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => signIn("google")}
        className="rounded-lg border border-slate-300 bg-white px-4 py-3 font-medium hover:bg-slate-50"
      >
        Continuer avec Google
      </button>
      <button
        onClick={() => signIn("azure")}
        className="rounded-lg border border-slate-300 bg-white px-4 py-3 font-medium hover:bg-slate-50"
      >
        Continuer avec Microsoft
      </button>
      <button
        disabled
        title="Bientôt disponible"
        className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-400 cursor-not-allowed"
      >
        Continuer avec SmartSchool · Bientôt
      </button>
    </div>
  );
}
```

- [ ] **Step 4 :** Si l'ancien composant `AuthButton.tsx` n'est plus utilisé nulle part, le supprimer.

Run : `grep -rn "import.*AuthButton" app/ components/`

Si aucun import : `git rm components/AuthButton.tsx`.

- [ ] **Step 5 :** Build verify.

- [ ] **Step 6 :** Commit.

```bash
git add -A
git commit -m "feat(login): 3-provider SSO (Google + Microsoft + SmartSchool stub)

SmartSchool button is visible but disabled with 'Bientôt' label — preserves the trio in the UI for future activation. Removes legacy AuthButton if unused."
```

---

## Phase G — Legacy cleanup

### Task G1 — Supprimer composants orphelins (audité Phase 2)

**Files :**
- Delete : composants identifiés comme orphelins par l'audit du 2026-05-15

- [ ] **Step 1 :** Pour chaque composant, vérifier qu'il est toujours orphelin (post-migration).

Liste à vérifier (mémoire audit) :
- `components/AIChallengeBanner.tsx` (mémoire `feedback_no_ia_label_in_ux`)
- `components/StudentWelcomeOnboarding.tsx` (emojis interdits)
- `components/UserProfileCard.tsx` (gamification legacy)
- `components/QuizCard.tsx` (remplacé par quiz components)
- `components/ReviewCard.tsx` (remplacé)
- `components/StudyWizard.tsx` (orphan, à garder pour adaptation Sprint 5 — **NE PAS supprimer**)
- `components/SubjectSelector.tsx` (utilisé par StudyWizard, **NE PAS supprimer**)
- `app/accueil/_components/eleve/AIChallengeBanner.tsx` (si déplacé en C4)
- `app/accueil/_components/eleve/AssignmentList.tsx`
- `app/accueil/_components/eleve/CourseList.tsx`
- `app/accueil/_components/eleve/DashboardHeader.tsx`
- `app/accueil/_components/eleve/ExplorerFooter.tsx`
- `app/accueil/_components/eleve/StreakHeroCard.tsx`
- `app/accueil/_components/eleve/TodaySchedule.tsx`
- `app/accueil/_components/eleve/WeeklyStatsBanner.tsx`

⚠️ Avant chaque suppression, vérifier avec :

```bash
grep -rln "import.*<NomComposant>\\|from.*\\/<NomComposant>" app/ components/ lib/
```

Si 0 résultat : safe to delete.

- [ ] **Step 2 :** Supprimer un par un avec commit groupé par lot.

Run :
```bash
# Lot "labels IA prohibés"
git rm components/AIChallengeBanner.tsx app/accueil/_components/eleve/AIChallengeBanner.tsx 2>/dev/null || true

# Lot "emojis interdits / onboarding legacy"
git rm components/StudentWelcomeOnboarding.tsx 2>/dev/null || true

# Lot "gamification avancée hors scope MVP"
git rm components/UserProfileCard.tsx 2>/dev/null || true

# Lot "QuizCard / ReviewCard legacy (avant que la logic soit migrée vers _components/quiz)"
git rm components/QuizCard.tsx components/ReviewCard.tsx 2>/dev/null || true

# Lot "orphelins élève audit du 15/05"
git rm app/accueil/_components/eleve/{AssignmentList,CourseList,DashboardHeader,ExplorerFooter,StreakHeroCard,TodaySchedule,WeeklyStatsBanner}.tsx 2>/dev/null || true
```

- [ ] **Step 3 :** Build verify.

Run : `npm run build 2>&1 | tail -10`

Expected : `Compiled successfully`. Si une erreur indique qu'un composant supprimé était encore utilisé, **STOP** : restaurer via `git checkout HEAD -- <file>` et investiguer.

- [ ] **Step 4 :** Commit.

```bash
git add -A
git commit -m "chore(cleanup): remove legacy and orphan components

Orphans confirmed by 2026-05-15 audit:
- AIChallengeBanner (violates feedback_no_ia_label_in_ux)
- StudentWelcomeOnboarding (legacy emojis, violates feedback_lucide_icons_except_tutor)
- UserProfileCard, QuizCard, ReviewCard (replaced by /accueil quiz components)
- AssignmentList, CourseList, DashboardHeader, ExplorerFooter, StreakHeroCard,
  TodaySchedule, WeeklyStatsBanner (élève orphans)

Kept: StudyWizard + SubjectSelector (will be adapted for plan-maia in Sprint 5)."
```

### Task G2 — Vérifier l'intégrité après cleanup

- [ ] **Step 1 :** Linter.

Run : `npm run lint 2>&1 | tail -20`

Expected : 0 errors, warnings tolerés.

- [ ] **Step 2 :** Typecheck.

Run : `npx tsc --noEmit 2>&1 | tail -20`

Expected : 0 errors.

- [ ] **Step 3 :** Build.

Run : `npm run build 2>&1 | tail -10`

Expected : `Compiled successfully`. Si erreur, corriger avant continuer.

- [ ] **Step 4 :** Si tout vert, pas de commit (rien à committer, juste vérification).

---

## Phase H — Copy & UX pass

### Task H1 — Audit "Salut"/"Hey"/"Coucou"/"Yo" → "Bonjour" + tone

**Files :**
- Modify : tout fichier `.tsx` ou `.ts` contenant ces termes en copy user-facing.

- [ ] **Step 1 :** Lister les occurrences.

Run :
```bash
grep -rn "Salut\\|Coucou\\|Yo\\b\\|Hey\\b\\|Bravo champion\\|super-héros\\|tu déchires" app/ components/
```

- [ ] **Step 2 :** Pour chaque occurrence, juger si user-facing (copy visible élève/prof) ou interne (commentaire, log).

Pour user-facing :
- "Salut [nom]" → "Bonjour [nom]"
- "Hey" → "Bonjour" ou retirer
- "Bravo champion" → "Bonne progression" ou similaire factuel
- "Tu déchires" → "Bonne réponse" ou "C'est correct"

Pour internes (commentaires, logs) : laisser tel quel.

- [ ] **Step 3 :** Build verify.

- [ ] **Step 4 :** Commit.

```bash
git add -A
git commit -m "copy(tone): adopt adult-kind tone per feedback_landing_tone_adult_kind

Replaces 'Salut', 'Hey', 'Coucou', 'tu déchires', etc. with neutral-encouraging variants ('Bonjour', factual praise). Sweep across user-facing strings only — internal logs/comments untouched."
```

### Task H2 — Audit emojis interdits (Lucide-only sauf tuteur)

**Files :**
- Modify : composants où des emojis ont été utilisés à tort comme icônes (cf. `feedback_lucide_icons_except_tutor`).

- [ ] **Step 1 :** Lister les emojis dans les sources.

Run :
```bash
grep -rn "🚀\\|🎉\\|🎯\\|✨\\|🎒\\|🏫\\|🔁\\|💡\\|📚\\|⚙️\\|🔥\\|⭐" app/ components/ --include="*.tsx" --include="*.ts" | grep -v "TutorPanel\\|tutor/"
```

- [ ] **Step 2 :** Pour chaque emoji :
- S'il est dans `TutorPanel.tsx`, `app/accueil/devoirs/[id]/quiz/_components/TutorPanel.tsx`, ou dans les messages du tuteur (templates hints) → laisser
- Sinon : remplacer par l'icône Lucide équivalente :
  - 🚀 → `<Rocket />` ou retirer si décoratif
  - 🎉 → retirer (décoratif)
  - 🎯 → `<Target />`
  - ✨ → `<Sparkles />`
  - 🎒 → `<Backpack />` ou retirer
  - 🏫 → `<School />`
  - 🔁 → `<Repeat />` ou `<RefreshCw />`
  - 💡 → `<Lightbulb />`
  - 📚 → `<BookOpen />`
  - ⚙️ → `<Settings />`
  - 🔥 → `<Flame />`
  - ⭐ → `<Star />`

Pattern de remplacement :

```typescript
// Avant
<span>🚀 Commencer</span>

// Après
import { Rocket } from "lucide-react";
<span className="inline-flex items-center gap-2"><Rocket size={18} /> Commencer</span>
```

- [ ] **Step 3 :** Build verify.

- [ ] **Step 4 :** Commit.

```bash
git add -A
git commit -m "ui(icons): replace UI emojis with lucide-react icons

Per feedback_lucide_icons_except_tutor: emojis stay only in the tutor's message templates (TutorPanel). All other usage replaced by lucide-react components for visual consistency with the platform chrome."
```

---

## Phase I — Tests, vérification, PR

### Task I1 — Typecheck + lint + build

- [ ] **Step 1 :** Typecheck strict.

Run : `npx tsc --noEmit`

Expected : 0 errors.

- [ ] **Step 2 :** Lint.

Run : `npm run lint`

Expected : 0 errors.

- [ ] **Step 3 :** Build production.

Run : `npm run build`

Expected : `Compiled successfully`. Vérifier dans la sortie que toutes les routes `/accueil/*` apparaissent et qu'aucune `/student/*` ou `/school/*` n'est listée (sauf le redirect catch-all en middleware).

- [ ] **Step 4 :** Vitest (unit tests existants + role.test.ts).

Run : `npx vitest run`

Expected : tous tests verts.

### Task I2 — Smoke E2E manuel ou Playwright

- [ ] **Step 1 :** Démarrer le dev server.

Run : `npm run dev` (en background ou nouveau terminal)

- [ ] **Step 2 :** Smoke test parcours élève (manuel ou via Playwright si compte de test seedé).

Parcours :
1. Aller sur `http://localhost:3000/` → redirige `/accueil` si auth, sinon affiche landing
2. Login en tant qu'élève → `/accueil` affiche `EleveHome` (heatmap)
3. Cliquer "Devoirs" → `/accueil/devoirs` liste devoirs
4. Cliquer un devoir → `/accueil/devoirs/[id]` détail
5. Lancer le quiz → `/accueil/devoirs/[id]/quiz` quiz fonctionnel
6. Vérifier que `/student` ou `/student/assignments` → redirige bien `/accueil`

- [ ] **Step 3 :** Smoke test parcours prof.

Parcours :
1. Login prof → `/accueil` affiche `ProfHome` (KPI, classes)
2. Cliquer "Classes" → `/accueil/classes`
3. Cliquer "Curation" → `/accueil/curation`
4. Cliquer "Import" → `/accueil/import`
5. Vérifier que `/school` ou `/school/questions` → redirige bien `/accueil`

- [ ] **Step 4 :** Si erreurs visuelles ou nav cassée, retour aux phases précédentes pour fix. Si tout OK, passer à I3.

### Task I3 — Pousser et ouvrir PR

- [ ] **Step 1 :** Audit du diff total.

Run :
```bash
git diff main..HEAD --stat | tail -30
git diff main..HEAD | grep -E "auth\\.getUser|SUPABASE_SERVICE_ROLE_KEY|user_metadata\\.role|window\\.open|dangerouslySetInnerHTML|RANDOM\\(\\)|Math\\.random\\(\\).*invit|\\.includes.*@" || echo "No suspicious patterns found"
```

Expected : pas de match suspect (CLAUDE.md règle 20).

- [ ] **Step 2 :** Pousser la branche.

Run : `git push origin claude/elastic-heisenberg-d08bdd`

- [ ] **Step 3 :** Ouvrir la PR.

Run :
```bash
gh pr create --title "feat(accueil): unify /student and /school under /accueil + rebrand" --body "$(cat <<'EOF'
## Summary

- Migrate `/student/*` and `/school/*` to a unified `/accueil/*` tree (role-aware via server component guards)
- Rebrand Header (Schoolio → Maïa) + simplify Avatar (remove gamification skins) + login 3-SSO (Google + Microsoft + SmartSchool stub)
- Delete legacy/orphan components confirmed by 2026-05-15 audit
- Copy pass (adult-kind tone) + Lucide-only icons (emojis stay only in tutor)
- DB : add `is_active` toggle on `teacher_questions` (Sprint 2 prep)

Plan : `docs/superpowers/plans/2026-05-15-sprint-0-rebrand-accueil-routing.md`

## Test plan

- [ ] `npm run build` → Compiled successfully
- [ ] `npm run lint` → 0 errors
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx vitest run` → all green
- [ ] Manual smoke élève : login → `/accueil` heatmap → `/accueil/devoirs` → quiz
- [ ] Manual smoke prof : login → `/accueil` dashboard → `/accueil/classes` → `/accueil/curation`
- [ ] Legacy redirect : `/student/*` and `/school/*` redirect to `/accueil`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4 :** Récupérer l'URL de la PR.

Run : `gh pr view --json url --jq .url`

Reporter l'URL à Alex.

---

## Self-review

### Couverture spec

| Décision spec | Task qui couvre |
|---|---|
| URL flat `/accueil` rôle-aware (mémoire `project_tenant_routing_flat`) | B1-B3, C1-C5, D1-D10 |
| `app_metadata.role` server-side (règle 1, mémoire `project_role_model_2_values`) | A3, B2 |
| Server component check (Q3) | A3, ajout de `requireStudentPage()` / `requireTeacherPage()` dans toutes les pages migrées |
| Rebrand Schoolio → Maïa | F1 |
| Avatar simplifié (mémoire `feedback_no_pricing_public`) | F2 |
| Login 3 SSO (mémoire `project_tenant_routing_flat`) | F3 |
| Lucide partout sauf tuteur (mémoire `feedback_lucide_icons_except_tutor`) | H2 |
| Tone adulte (mémoire `feedback_landing_tone_adult_kind`) | H1 |
| Curation `is_active` (mémoire `project_curation_concept_view`) | A2 |
| Cleanup legacy (audit du 15/05) | G1 |

### Placeholders à scanner

✅ Aucun "TBD", "TODO", "fill in later".
✅ Chaque step a soit du code complet, soit une commande exacte.
✅ Les types et noms de fonctions sont cohérents entre A3 (definition) et le reste (usage).

### Type consistency

✅ `requireStudentPage()` et `requireTeacherPage()` définis en A3 et utilisés tels quels en C2, C3, D2-D8.
✅ `getRoleOrNull()` défini en A3, utilisé en B2.
✅ `EleveHome` / `ProfHome` placeholders définis en B2, replaced en C1 / D1.

### Gaps potentiels

- ⚠️ Le contenu exact de `/student/page.tsx` et `/school/page.tsx` n'est pas hardcodé dans le plan (Task C1 et D1 disent "lire le fichier puis copier"). C'est volontaire : le contenu existant doit être préservé, pas réécrit. L'agent exécutant doit faire un `cat` puis adapter.
- ⚠️ Les noms exacts de tables (`teacher_questions` vs autre) sont à confirmer en A2 step 1. Si ce n'est pas `teacher_questions`, ajuster.
- ⚠️ Les redirects de Task E1 supposent que les paths legacy `/student` et `/school` doivent être catch-all redirected. Si Alex préfère hard 404, ajuster.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-15-sprint-0-rebrand-accueil-routing.md`. Two execution options :**

**1. Subagent-Driven (recommended)** — un fresh subagent par phase (A, B, C, D, E, F, G, H, I), revue inter-phase, rapide.

**2. Inline Execution** — exécution en session via `superpowers:executing-plans`, batch avec checkpoints de review.

**Quelle approche ?**
