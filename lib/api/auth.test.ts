import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase server client and the admin allowlists. These mocks need
// to be declared before importing the module under test because vi.mock is
// hoisted but the actual factory functions run lazily on first import.

const mockGetUser = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  }),
}));

vi.mock("@/lib/admin-config", () => ({
  ADMIN_EMAILS: ["admin@test.com", "alex@test.com"] as readonly string[],
  SUPER_ADMIN_EMAILS: ["super@test.com"] as readonly string[],
  VALIDATOR_EMAILS: [] as readonly string[],
}));

// Import after the mocks so they apply.
import { requireUser, requireAdmin, requireSuperAdmin, requireTeacher } from "./auth";

const fakeUser = (overrides: { email?: string | null; id?: string } = {}) => ({
  id: overrides.id ?? "user-123",
  // Preserve null explicitly — otherwise ?? falls through to the default.
  email: "email" in overrides ? overrides.email : "regular@test.com",
});

describe("requireUser", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockRpc.mockReset();
  });

  it("returns ok=true with the user when authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser({ email: "alice@test.com" }) },
      error: null,
    });

    const result = await requireUser();
    if (!result.ok) throw new Error("Expected ok");
    expect(result.user.email).toBe("alice@test.com");
    expect(result.email).toBe("alice@test.com");
  });

  it("lowercases the email field", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser({ email: "Alice@Test.COM" }) },
      error: null,
    });

    const result = await requireUser();
    if (!result.ok) throw new Error("Expected ok");
    expect(result.email).toBe("alice@test.com");
  });

  it("returns 401 when no user", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const result = await requireUser();
    if (result.ok) throw new Error("Expected error");
    expect(result.response.status).toBe(401);
    expect(await result.response.json()).toEqual({ error: "Non authentifié" });
  });

  it("returns 500 when the auth call errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "JWT expired" },
    });

    const result = await requireUser();
    if (result.ok) throw new Error("Expected error");
    expect(result.response.status).toBe(500);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("handles empty email gracefully (returns empty-string email)", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser({ email: null as unknown as string }) },
      error: null,
    });

    const result = await requireUser();
    if (!result.ok) throw new Error("Expected ok");
    expect(result.email).toBe("");
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockRpc.mockReset();
  });

  it("returns ok when user.email is in ADMIN_EMAILS", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser({ email: "admin@test.com" }) },
      error: null,
    });

    const result = await requireAdmin();
    if (!result.ok) throw new Error("Expected ok");
    expect(result.email).toBe("admin@test.com");
  });

  it("matches admin email case-insensitively", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser({ email: "ADMIN@TEST.com" }) },
      error: null,
    });

    const result = await requireAdmin();
    expect(result.ok).toBe(true);
  });

  it("returns 403 when user is authenticated but not in ADMIN_EMAILS", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser({ email: "stranger@evil.com" }) },
      error: null,
    });

    const result = await requireAdmin();
    if (result.ok) throw new Error("Expected error");
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({ error: "Accès refusé" });
  });

  it("returns 401 when no user (does not 403 leak)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const result = await requireAdmin();
    if (result.ok) throw new Error("Expected error");
    expect(result.response.status).toBe(401);
  });
});

describe("requireSuperAdmin", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
  });

  it("returns ok when user.email is in SUPER_ADMIN_EMAILS", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser({ email: "super@test.com" }) },
      error: null,
    });

    const result = await requireSuperAdmin();
    expect(result.ok).toBe(true);
  });

  it("returns 403 for an ADMIN_EMAIL who is NOT a super-admin", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser({ email: "admin@test.com" }) },
      error: null,
    });

    const result = await requireSuperAdmin();
    if (result.ok) throw new Error("Expected error");
    expect(result.response.status).toBe(403);
  });
});

describe("requireTeacher", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockRpc.mockReset();
  });

  it("returns ok when the RPC is_current_user_school_teacher returns true", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser({ email: "teacher@school.com" }) },
      error: null,
    });
    mockRpc.mockResolvedValueOnce({ data: true, error: null });

    const result = await requireTeacher();
    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("is_current_user_school_teacher");
  });

  it("returns 403 when the RPC returns false", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser({ email: "student@school.com" }) },
      error: null,
    });
    mockRpc.mockResolvedValueOnce({ data: false, error: null });

    const result = await requireTeacher();
    if (result.ok) throw new Error("Expected error");
    expect(result.response.status).toBe(403);
  });

  it("returns 403 when the RPC returns null/undefined (fail-closed)", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: fakeUser({ email: "anyone@school.com" }) },
      error: null,
    });
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await requireTeacher();
    if (result.ok) throw new Error("Expected error");
    expect(result.response.status).toBe(403);
  });

  it("returns 401 when no user (skips the RPC)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const result = await requireTeacher();
    if (result.ok) throw new Error("Expected error");
    expect(result.response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
