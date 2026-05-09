import { createClient } from "@supabase/supabase-js";

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getStudentAuthorizedSubjects(userId: string): Promise<string[]> {
  const db = getDb();

  const { data: memberships } = await db
    .from("class_memberships")
    .select("class_id")
    .eq("student_user_id", userId)
    .eq("status", "active");

  const classIds = ((memberships ?? []) as { class_id: string }[]).map((m) => m.class_id);
  if (classIds.length === 0) return [];

  const { data: assignments } = await db
    .from("assignments")
    .select("resource_id")
    .in("class_id", classIds)
    .is("archived_at", null);

  const courseIds = [
    ...new Set(((assignments ?? []) as { resource_id: string }[]).map((a) => a.resource_id)),
  ];
  if (courseIds.length === 0) return [];

  const { data: courses } = await db
    .from("courses")
    .select("subject_enum")
    .in("id", courseIds);

  return [
    ...new Set(
      ((courses ?? []) as { subject_enum: string | null }[])
        .map((c) => c.subject_enum)
        .filter((s): s is string => s !== null && s !== "")
    ),
  ];
}
