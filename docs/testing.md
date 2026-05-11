# Testing — Schoolio

Le projet utilise **Vitest** pour les tests unitaires et l'intégration côté serveur.
Pas de Playwright / E2E pour l'instant — viendra dans une PR séparée (Claudia).

## Lancer les tests

```bash
# Mode watch (relance auto sur modif)
npm test

# Une seule passe (CI / pré-push)
npm run test:run

# Avec coverage HTML
npm run test:coverage
# → ouvre coverage/index.html
```

## Convention de fichier

Tests **co-localisés** avec le code source :

```
lib/api/auth.ts          ← le code
lib/api/auth.test.ts     ← son test (à côté)
```

Vitest pickup automatique via le glob `lib/**/*.test.ts` et `app/**/*.test.ts`
(voir `vitest.config.ts`).

## Ce qui est couvert aujourd'hui

| Fichier | Tests | Niveau |
|---|---|---|
| `lib/api/respond.ts` | `lib/api/respond.test.ts` (10 tests) | unitaire pur |
| `lib/api/auth.ts` | `lib/api/auth.test.ts` (15 tests) | unitaire avec mock Supabase |

**Pas encore testé** (à venir dans des PRs ultérieures) :

- `lib/api/pin.ts` + `lib/api/beta-cookie.ts` → après merge du hotfix #4
- Routes API (`app/api/**/route.ts`) → intégration avec mocks Supabase
- Composants React (`components/*`, `app/**/page.tsx`) → besoin de jsdom + @testing-library/react

## Comment écrire un test

Pattern type pour une fonction pure :

```ts
import { describe, it, expect } from "vitest";
import { maFonction } from "./mon-module";

describe("maFonction", () => {
  it("fait ce qu'on attend", () => {
    expect(maFonction("input")).toBe("output");
  });
});
```

Pattern pour une fonction qui dépend de Supabase / Next :

```ts
import { describe, it, expect, vi } from "vitest";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

// Important: import du code testé APRES le vi.mock
import { requireUser } from "./auth";

describe("requireUser", () => {
  it("renvoie 401 sans user", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const result = await requireUser();
    if (result.ok) throw new Error("Expected error");
    expect(result.response.status).toBe(401);
  });
});
```

## Quand un test ÉCHOUE

- **En local** : vois lequel, lis le diff, fix le code (ou le test si l'attente est mauvaise).
- **Sur CI** : la PR est bloquée (job CI required). Tu ne peux pas merger.

Si tu veux skipper un test temporairement (à éviter) : `it.skip(...)` ou `describe.skip(...)`.
**Toujours ouvrir une carte board** pour ré-activer plus tard.

## CI (GitHub Actions)

Le workflow `.github/workflows/ci.yml` tourne sur chaque PR et push vers `main`. Il fait :

1. `npm ci` (install)
2. `npm run lint` (non-bloquant pour l'instant — à durcir)
3. `npx tsc --noEmit` (type check)
4. `npm run test:run` (tous les tests Vitest)
5. `npm run build` (Next build avec env vars CI placeholder)

Les env vars CI sont des placeholders (pas de secrets en clair) — le build vérifie juste que l'app compile, pas qu'elle fonctionne en runtime.

## Roadmap testing

- **PR 0.1** : tests pour `lib/api/pin.ts` + `lib/api/beta-cookie.ts` après merge hotfix #4
- **PR 0.2** : intégration Sentry pour catch les erreurs prod
- **PR 0.3** : `tsconfig.json strict: true` + fix des erreurs qui tombent
- **PR Claudia** : Playwright + 3 E2E flows critiques (signup light, finish-quiz, beta gate)
- **PR ESLint custom rule** : flag les routes API qui n'importent pas `lib/api/auth`
