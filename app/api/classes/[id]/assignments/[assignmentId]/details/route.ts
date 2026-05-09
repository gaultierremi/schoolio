import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type CompletionRow = {
  student_user_id: string;
  status: string;
  score: number | null;
  duration_seconds: number | null;
  attempts_count: number;
  last_attempt_at: string | null;
  completed_at: string | null;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; assignmentId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    const { data: assignment, error: aErr } = await admin
      .from("assignments")
      .select("id, title, description, resource_type, resource_id, due_date, archived_at, created_at, class_id, assigned_by")
      .eq("id", params.assignmentId)
      .eq("class_id", params.id)
      .eq("assigned_by", user.id)
      .maybeSingle();

    if (aErr) throw aErr;
    if (!assignment) return NextResponse.json({ error: "Devoir introuvable" }, { status: 404 });

    const [membersRes, completionsRes, courseRes] = await Promise.all([
      admin
        .from("class_memberships")
        .select("student_user_id, joined_at")
        .eq("class_id", params.id)
        .eq("status", "active"),
      admin
        .from("assignment_completions")
        .select("student_user_id, status, score, duration_seconds, attempts_count, last_attempt_at, completed_at")
        .eq("assignment_id", params.assignmentId),
      admin
        .from("courses")
        .select("title")
        .eq("id", assignment.resource_id)
        .maybeSingle(),
    ]);

    const members = membersRes.data ?? [];
    const completions = completionsRes.data ?? [] as CompletionRow[];
    const completionByStudent: Record<string, CompletionRow> = {};
    for (const c of completions) {
      completionByStudent[c.student_user_id] = c as CompletionRow;
    }

    // Get student names from user_profiles
    const studentIds = members.map((m) => m.student_user_id);
    const profileMap: Record<string, string> = {};
    if (studentIds.length > 0) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, user_name, pseudo, auth_mode")
        .in("id", studentIds);
      for (const p of profiles ?? []) {
        const profile = p as { id: string; user_name: string | null; pseudo: string | null; auth_mode: string | null };
        profileMap[profile.id] =
          profile.auth_mode === "light" && profile.pseudo
            ? profile.pseudo
            : (profile.user_name ?? profile.id.slice(0, 8));
      }
    }

    const students = members.map((m) => {
      const c = completionByStudent[m.student_user_id];
      return {
        student_user_id: m.student_user_id,
        display_name: profileMap[m.student_user_id] ?? m.student_user_id.slice(0, 8),
        status: c?.status ?? "pending",
        score: c?.score ?? null,
        duration_seconds: c?.duration_seconds ?? null,
        attempts_count: c?.attempts_count ?? 0,
        last_attempt_at: c?.last_attempt_at ?? null,
        completed_at: c?.completed_at ?? null,
      };
    });

    return NextResponse.json({
      assignment: { ...assignment, course_title: courseRes.data?.title ?? "—" },
      students,
    });
  } catch (err) {
    console.error("[assignment/details:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
