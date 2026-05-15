import { test, expect } from "@playwright/test";

test.describe("/accueil role-aware dispatch", () => {
  test.skip(
    () => process.env.E2E_RUN_ACCUEIL_TESTS !== "1",
    "Skipped by default. Set E2E_RUN_ACCUEIL_TESTS=1 to run. " +
      "Requires a running dev server with valid Supabase env vars.",
  );

  test("unauthenticated user is redirected to /login with next=/accueil", async ({
    page,
  }) => {
    await page.goto("/accueil");
    await expect(page).toHaveURL(/\/login(\?next=%2Faccueil)?$/);
  });

  test("unauthenticated user on / sees the public landing", async ({ page }) => {
    await page.goto("/");
    // Landing is public — middleware allows the request through.
    await expect(page).toHaveURL("/");
  });

  // Note : tests with authenticated sessions (élève → EleveHome, prof → ProfHome)
  // require seed users in Supabase and the SSO flow. They land in Sprint 5 when
  // Google OAuth + test users are wired (see multi-tenant-isolation.spec.ts).
});
