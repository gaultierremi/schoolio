import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type MembershipRow = { class_id: string; classes: { name: string; subject: string | null } };
type AssignmentRow = {
  id: string;
  title: string;
  description: string | null;
  resource_type: string;
  resource_id: string;
  due_date: string | null;
  class_id: string;
};
type CompletionRow = {
  assignment_id: string;
  status: string;
  score: number | null;
  attempts_count: number;
  completed_at: string | null;
  last_attempt_at: string | null;
};

const STATUS_ORDER: Record<string, number> = { pending: 0, in_progress: 1, completed: 2 };

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const admin = createAdminClient();

    const { data: memberships } = await admin
      .from("class_memberships")
      .select("class_id, classes!inner(name, subject)")
      .eq("student_user_id", user.id)
      .eq("status", "active");

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ assignments: [] });
    }

    const rows = memberships as unknown as MembershipRow[];
    const classIds = rows.map((m) => m.class_id);
    const classNameMap: Record<string, string> = {};
    const classSubjectMap: Record<string, string | null> = {};
    for (const m of rows) {
      classNameMap[m.class_id] = m.classes.name;
      classSubjectMap[m.class_id] = m.classes.subject;
    }

    const { data: assignments } = await admin
      .from("assignments")
      .select("id, title, description, resource_type, resource_id, due_date, class_id")
      .in("class_id", classIds)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({ assignments: [] });
    }

    const assignmentIds = (assignments as AssignmentRow[]).map((a) => a.id);

    const { data: completions } = await admin
      .from("assignment_completions")
      .select("assignment_id, status, score, attempts_count, completed_at, last_attempt_at")
      .eq("student_user_id", user.id)
      .in("assignment_id", assignmentIds);

    const completionMap: Record<string, CompletionRow> = {};
    for (const c of (completions ?? []) as CompletionRow[]) {
      completionMap[c.assignment_id] = c;
    }

    // Course titles
    const resourceIds = [...new Set((assignments as AssignmentRow[]).map((a) => a.resource_id))];
    const { data: courses } = await admin
      .from("courses")
      .select("id, title")
      .in("id", resourceIds);
    const courseMap: Record<string, string> = {};
    for (const c of courses ?? []) courseMap[c.id] = c.title ?? "Sans titre";

    const result = (assignments as AssignmentRow[]).map((a) => {
      const c = completionMap[a.id];
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        resource_type: a.resource_type,
        resource_id: a.resource_id,
        course_title: courseMap[a.resource_id] ?? "—",
        class_id: a.class_id,
        class_name: classNameMap[a.class_id] ?? "—",
        subject: classSubjectMap[a.class_id] ?? null,
        due_date: a.due_date,
        status: c?.status ?? "pending",
        score: c?.score ?? null,
        attempts_count: c?.attempts_count ?? 0,
        completed_at: c?.completed_at ?? null,
        last_attempt_at: c?.last_attempt_at ?? null,
      };
    });

    result.sort((a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0));

    return NextResponse.json({ assignments: result });
  } catch (err) {
    console.error("[student/assignments:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
