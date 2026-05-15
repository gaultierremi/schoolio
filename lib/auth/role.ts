import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export type AppRole = "student" | "teacher";

/**
 * Reads the role from app_metadata (server-trusted).
 * NEVER reads user_metadata — that's client-mutable per règle interne #1 CLAUDE.md.
 */
function readRole(user: User | null): AppRole | null {
  if (!user) return null;
  const role = (user.app_metadata as Record<string, unknown>)?.role;
  if (role === "student" || role === "teacher") return role;
  return null;
}

/**
 * Returns the current user's role, or null if not authenticated / unknown role.
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
 * Guard for student-only server component pages. Calls redirect() on failure
 * (throws internally — never returns on failure path).
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
