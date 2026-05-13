import { isFounderTeacher } from "@/lib/founders";

export type UserRole = "teacher" | "student" | "admin";

/**
 * Resolves the role for a NEW user based on their email.
 *
 * Dogfood mode rules (Sprint 0.5):
 * - Email in public.founder_teachers → "teacher"
 * - Anyone else → "student"
 *
 * Admin role is set manually via Supabase Studio for now (Alex + Gaultier
 * already get admin access via SUPER_ADMIN_EMAILS check at route level).
 */
export async function resolveUserRole(email: string): Promise<UserRole> {
  return (await isFounderTeacher(email)) ? "teacher" : "student";
}
