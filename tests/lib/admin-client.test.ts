import { describe, it, expect, beforeEach } from "vitest";
import { getAdminClient, resetAdminClient, withAdminClient } from "@/lib/db/admin-client";

describe("admin-client singleton", () => {
  beforeEach(() => {
    resetAdminClient();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
  });

  it("returns the same client on subsequent calls", async () => {
    const a = await getAdminClient();
    const b = await getAdminClient();
    expect(a).toBe(b);
  });

  it("returns a new client after reset", async () => {
    const a = await getAdminClient();
    resetAdminClient();
    const b = await getAdminClient();
    expect(a).not.toBe(b);
  });

  it("withAdminClient retries once on JWT error", async () => {
    let calls = 0;
    const result = await withAdminClient(async () => {
      calls++;
      if (calls === 1) throw new Error("JWT expired");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("withAdminClient throws on non-auth error", async () => {
    await expect(
      withAdminClient(async () => {
        throw new Error("network down");
      }),
    ).rejects.toThrow("network down");
  });

  it("concurrent calls during first build return the same client (promise dedup)", async () => {
    const [a, b, c] = await Promise.all([
      getAdminClient(),
      getAdminClient(),
      getAdminClient(),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("does not retry more than once when fresh client also fails on JWT", async () => {
    let calls = 0;
    await expect(
      withAdminClient(async () => {
        calls++;
        throw new Error("JWT expired");
      }),
    ).rejects.toThrow("JWT expired");
    expect(calls).toBe(2); // initial + 1 retry, then re-throws
  });
});
