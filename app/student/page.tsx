import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import StudentDashboardClient from "./StudentDashboardClient";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type MembershipRow = {
  id: string;
  class_id: string;
  joined_at: string;
  classes: {
    name: string;
    level: string | null;
    subject: string | null;
    teacher_id: string;
  };
};

export default async function StudentPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const role = (user.user_metadata as Record<string, unknown>)?.role;
  if (role !== "student") redirect("/school");

  const admin = createAdminClient();

  const { data: memberships } = await admin
    .from("class_memberships")
    .select(
      "id, class_id, joined_at, classes!inner(name, level, subject, teacher_id)"
    )
    .eq("student_user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: false });

  const rows = (memberships ?? []) as unknown as MembershipRow[];

  const teacherIds = [...new Set(rows.map((r) => r.classes.teacher_id))];
  const teacherMap: Record<string, string> = {};

  if (teacherIds.length > 0) {
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("id, user_name")
      .in("id", teacherIds);
    for (const p of profiles ?? []) {
      teacherMap[p.id] = p.user_name;
    }
  }

  const meta = user.user_metadata as Record<string, unknown>;
  const displayName =
    (meta?.pseudo as string | undefined) ||
    (meta?.firstName as string | undefined) ||
    user.email?.split("@")[0] ||
    "Élève";

  const classes = rows.map((r) => ({
    classId: r.class_id,
    className: r.classes.name,
    level: r.classes.level,
    subject: r.classes.subject,
    teacherName: teacherMap[r.classes.teacher_id] ?? "Prof",
    joinedAt: r.joined_at,
  }));

  return (
    <StudentDashboardClient displayName={displayName} classes={classes} />
  );
}
