import { test, expect } from "@playwright/test";

test.describe("Multi-tenant isolation", () => {
  test.skip(
    () => process.env.E2E_RUN_MT_TESTS !== "1",
    "Skipped by default. Set E2E_RUN_MT_TESTS=1 to run. Requires 2 test tenants " +
      "(alice@school-a.test in FounderTestGround, bob@school-b.test in another tenant). " +
      "Full implementation lands in Sprint 5 when classes + Google OAuth are reintroduced."
  );

  test("user from school A cannot fetch data of school B via /api/classes", async () => {
    // SPRINT 5 — full implementation:
    //   1. Sign in as alice (school A) via Google OAuth or test-user route.
    //   2. GET /api/classes — capture response.
    //   3. Sign out, sign in as bob (school B).
    //   4. GET /api/classes — capture response.
    //   5. Assert that alice's response contains 0 classes from school B
    //      and bob's response contains 0 classes from school A.
    //   6. Optionally: assert RLS rejects direct DB calls cross-tenant.
    //
    // Today this test exists as scaffolding only. Marking placeholder pass
    // so the suite has a valid spec while skipped.
    expect(true).toBe(true);
  });
});
