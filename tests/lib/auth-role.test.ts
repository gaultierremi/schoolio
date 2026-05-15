import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

// Imports AFTER mocks so the mocked modules are used.
import {
  getRoleOrNull,
  getUserWithRole,
  requireStudentPage,
  requireTeacherPage,
} from "@/lib/auth/role";

beforeEach(() => {
  mockGetUser.mockReset();
});

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

  it("returns null for an unknown role value", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: { role: "admin" } } },
      error: null,
    });
    const role = await getRoleOrNull();
    expect(role).toBeNull();
  });
});

describe("getUserWithRole", () => {
  it("returns { user, role } for an authenticated student", async () => {
    const user = { id: "u1", app_metadata: { role: "student" } };
    mockGetUser.mockResolvedValueOnce({ data: { user }, error: null });
    const result = await getUserWithRole();
    expect(result.user).toEqual(user);
    expect(result.role).toBe("student");
  });

  it("returns { user, role: null } for authenticated but unknown role", async () => {
    const user = { id: "u1", app_metadata: { role: "admin" } };
    mockGetUser.mockResolvedValueOnce({ data: { user }, error: null });
    const result = await getUserWithRole();
    expect(result.user).toEqual(user);
    expect(result.role).toBeNull();
  });

  it("returns { user, role: null } for authenticated with missing role", async () => {
    const user = { id: "u1", app_metadata: {} };
    mockGetUser.mockResolvedValueOnce({ data: { user }, error: null });
    const result = await getUserWithRole();
    expect(result.user).toEqual(user);
    expect(result.role).toBeNull();
  });

  it("returns { user: null, role: null } when not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const result = await getUserWithRole();
    expect(result.user).toBeNull();
    expect(result.role).toBeNull();
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
    expect(result.role).toBe("student");
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

  it("redirects unauthenticated users to /login", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(requireTeacherPage()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("returns user when role is teacher", async () => {
    const user = { id: "u1", app_metadata: { role: "teacher" } };
    mockGetUser.mockResolvedValueOnce({ data: { user }, error: null });
    const result = await requireTeacherPage();
    expect(result.user).toEqual(user);
    expect(result.role).toBe("teacher");
  });
});
