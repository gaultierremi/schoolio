import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCurrentUserSchoolId, requireSchoolMembership } from "@/lib/tenant";

type MockSupabase = {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
};

function makeMockSupabase(): MockSupabase {
  const fromChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };
  return {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => fromChain),
  };
}

describe("getCurrentUserSchoolId", () => {
  let supabase: MockSupabase;
  beforeEach(() => {
    supabase = makeMockSupabase();
  });

  it("returns the school_id of the current user", async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    const fromChain = supabase.from() as ReturnType<MockSupabase["from"]>;
    (fromChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { school_id: "school-abc" },
      error: null,
    });

    const result = await getCurrentUserSchoolId(supabase as never);

    expect(result).toBe("school-abc");
    expect(supabase.from).toHaveBeenCalledWith("user_profiles");
  });

  it("returns null when no user is authenticated", async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const result = await getCurrentUserSchoolId(supabase as never);

    expect(result).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns null when the user has no school_id (e.g., legacy row)", async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    const fromChain = supabase.from() as ReturnType<MockSupabase["from"]>;
    (fromChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { school_id: null },
      error: null,
    });

    const result = await getCurrentUserSchoolId(supabase as never);

    expect(result).toBeNull();
  });
});

describe("requireSchoolMembership", () => {
  let supabase: MockSupabase;
  beforeEach(() => {
    supabase = makeMockSupabase();
  });

  it("throws if the user is not authenticated", async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(requireSchoolMembership(supabase as never)).rejects.toThrow(
      /not authenticated|unauthenticated/i
    );
  });

  it("throws if the user has no school membership", async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    const fromChain = supabase.from() as ReturnType<MockSupabase["from"]>;
    (fromChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { school_id: null },
      error: null,
    });

    await expect(requireSchoolMembership(supabase as never)).rejects.toThrow(
      /no school|school membership/i
    );
  });

  it("returns the school_id when membership is valid", async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    const fromChain = supabase.from() as ReturnType<MockSupabase["from"]>;
    (fromChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { school_id: "school-abc" },
      error: null,
    });

    const result = await requireSchoolMembership(supabase as never);

    expect(result).toBe("school-abc");
  });
});
