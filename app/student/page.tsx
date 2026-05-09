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
  classes: { name: string; level: string | null; subject: string | null; teacher_id: string };
};

type RawAssignment = {
  id: string;
  title: string;
  resource_type: string;
  resource_id: string;
  due_date: string | null;
  class_id: string;
};

type CompletionRow = {
  assignment_id: string;
  status: string;
  score: number | null;
};

export type AssignmentEntry = {
  id: string;
  title: string;
  resource_type: string;
  resource_id: string;
  due_date: string | null;
  class_id: string;
  class_name: string;
  status: string;
  score: number | null;
};

const STATUS_ORDER: Record<string, number> = { pending: 0, in_progress: 1, completed: 2 };

export default async function StudentPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const role = (user.user_metadata as Record<string, unknown>)?.role;
  if (role !== "student") redirect("/school");

  const admin = createAdminClient();

  const { data: memberships } = await admin
    .from("class_memberships")
    .select("id, class_id, joined_at, classes!inner(name, level, subject, teacher_id)")
    .eq("student_user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: false });

  const rows = (memberships ?? []) as unknown as MembershipRow[];
  const classIds = rows.map((r) => r.class_id);
  const classNameMap: Record<string, string> = {};
  for (const r of rows) classNameMap[r.class_id] = r.classes.name;

  const teacherIds = [...new Set(rows.map((r) => r.classes.teacher_id))];
  const teacherMap: Record<string, string> = {};
  if (teacherIds.length > 0) {
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("id, user_name")
      .in("id", teacherIds);
    for (const p of profiles ?? []) teacherMap[p.id] = p.user_name;
  }

  let assignments: AssignmentEntry[] = [];
  if (classIds.length > 0) {
    const { data: rawAssignments } = await admin
      .from("assignments")
      .select("id, title, resource_type, resource_id, due_date, class_id")
      .in("class_id", classIds)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    const raw = (rawAssignments ?? []) as RawAssignment[];
    const assignmentIds = raw.map((a) => a.id);
    const completionMap: Record<string, CompletionRow> = {};

    if (assignmentIds.length > 0) {
      const { data: completions } = await admin
        .from("assignment_completions")
        .select("assignment_id, status, score")
        .eq("student_user_id", user.id)
        .in("assignment_id", assignmentIds);
      for (const c of (completions ?? []) as CompletionRow[]) {
        completionMap[c.assignment_id] = c;
      }
    }

    assignments = raw.map((a) => {
      const c = completionMap[a.id];
      return {
        ...a,
        class_name: classNameMap[a.class_id] ?? "—",
        status: c?.status ?? "pending",
        score: c?.score ?? null,
      };
    });
    assignments.sort((a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0));
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
    <StudentDashboardClient displayName={displayName} classes={classes} assignments={assignments} />
  );
}
