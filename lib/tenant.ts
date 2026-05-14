import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns the school_id of the currently authenticated user, or null if
 * unauthenticated OR if the user_profiles row has no school_id (legacy data).
 *
 * Use this when "no school" is a soft state (e.g., onboarding flow).
 * Use `requireSchoolMembership` when "no school" is an error (e.g., API route).
 */
export async function getCurrentUserSchoolId(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data } = await supabase
    .from("user_profiles")
    .select("school_id")
    .eq("id", userData.user.id)
    .single();

  return (data?.school_id as string | null | undefined) ?? null;
}

/**
 * Returns the school_id of the current user. Throws when:
 * - The request is unauthenticated.
 * - The user has no school membership (school_id IS NULL on user_profiles).
 *
 * Callers in API routes should catch the throw and convert to apiError(...)
 * via the lib/api/respond helper (per CLAUDE.md rule 6).
 */
export async function requireSchoolMembership(
  supabase: SupabaseClient
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    throw new Error("User is not authenticated");
  }

  const { data } = await supabase
    .from("user_profiles")
    .select("school_id")
    .eq("id", userData.user.id)
    .single();

  const schoolId = data?.school_id as string | null | undefined;
  if (!schoolId) {
    throw new Error("User has no school membership");
  }

  return schoolId;
}
