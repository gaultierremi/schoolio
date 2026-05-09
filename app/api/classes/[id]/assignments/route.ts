import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity/log";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function assertTeacherOwnsClass(
  admin: ReturnType<typeof createAdminClient>,
  classId: string,
  teacherId: string
): Promise<boolean> {
  const { data } = await admin
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  return data !== null;
}

// ── GET : list assignments for a class ───────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();
    const owns = await assertTeacherOwnsClass(admin, params.id, user.id);
    if (!owns) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const { data: assignments, error } = await admin
      .from("assignments")
      .select("id, title, description, resource_type, resource_id, due_date, archived_at, created_at")
      .eq("class_id", params.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const assignmentIds = (assignments ?? []).map((a) => a.id);
    const resourceIds = [...new Set((assignments ?? []).map((a) => a.resource_id))];

    // Completions stats
    const completionMap: Record<string, { completed: number; total_with_row: number; score_sum: number; score_count: number }> = {};
    if (assignmentIds.length > 0) {
      const { data: completions } = await admin
        .from("assignment_completions")
        .select("assignment_id, status, score")
        .in("assignment_id", assignmentIds);
      for (const c of completions ?? []) {
        if (!completionMap[c.assignment_id]) {
          completionMap[c.assignment_id] = { completed: 0, total_with_row: 0, score_sum: 0, score_count: 0 };
        }
        completionMap[c.assignment_id].total_with_row++;
        if (c.status === "completed") {
          completionMap[c.assignment_id].completed++;
          if (c.score !== null) {
            completionMap[c.assignment_id].score_sum += Number(c.score);
            completionMap[c.assignment_id].score_count++;
          }
        }
      }
    }

    // Total active students in class
    const { count: totalStudents } = await admin
      .from("class_memberships")
      .select("id", { count: "exact", head: true })
      .eq("class_id", params.id)
      .eq("status", "active");

    // Course titles
    const courseMap: Record<string, string> = {};
    if (resourceIds.length > 0) {
      const { data: courses } = await admin
        .from("courses")
        .select("id, title")
        .in("id", resourceIds);
      for (const c of courses ?? []) {
        courseMap[c.id] = c.title ?? "Sans titre";
      }
    }

    const result = (assignments ?? []).map((a) => {
      const stats = completionMap[a.id];
      return {
        ...a,
        course_title: courseMap[a.resource_id] ?? "—",
        nb_completed: stats?.completed ?? 0,
        nb_total: totalStudents ?? 0,
        avg_score:
          stats && stats.score_count > 0
            ? Math.round(stats.score_sum / stats.score_count)
            : null,
      };
    });

    return NextResponse.json({ assignments: result });
  } catch (err) {
    console.error("[class/assignments:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ── POST : create assignment ──────────────────────────────────────────────────

type CreateBody = {
  title?: unknown;
  description?: unknown;
  resource_type?: unknown;
  resource_id?: unknown;
  due_date?: unknown;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = (await req.json()) as CreateBody;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length < 2 || title.length > 120) {
      return NextResponse.json({ error: "Titre invalide (2–120 caractères)" }, { status: 400 });
    }

    const resource_type = body.resource_type;
    if (resource_type !== "pdf" && resource_type !== "quiz") {
      return NextResponse.json({ error: "resource_type doit être 'pdf' ou 'quiz'" }, { status: 400 });
    }

    const resource_id = typeof body.resource_id === "string" ? body.resource_id.trim() : "";
    if (!resource_id) {
      return NextResponse.json({ error: "resource_id requis" }, { status: 400 });
    }

    const admin = createAdminClient();
    const owns = await assertTeacherOwnsClass(admin, params.id, user.id);
    if (!owns) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    // Verify course belongs to teacher
    const { data: course } = await admin
      .from("courses")
      .select("id, pdf_storage_path")
      .eq("id", resource_id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (!course) {
      return NextResponse.json({ error: "Cours introuvable ou accès refusé" }, { status: 404 });
    }

    if (resource_type === "pdf" && !course.pdf_storage_path) {
      return NextResponse.json({ error: "Ce cours n'a pas de PDF associé" }, { status: 400 });
    }

    if (resource_type === "quiz") {
      const { count } = await admin
        .from("teacher_questions")
        .select("id", { count: "exact", head: true })
        .eq("course_id", resource_id)
        .not("validated_at", "is", null)
        .is("rejected_at", null);

      if ((count ?? 0) === 0) {
        return NextResponse.json(
          { error: "Ce cours n'a aucune question validée. Ajoute et valide des questions avant de créer un quiz." },
          { status: 400 }
        );
      }
    }

    const { data: assignment, error: insertError } = await admin
      .from("assignments")
      .insert({
        class_id: params.id,
        assigned_by: user.id,
        title,
        description: typeof body.description === "string" ? body.description.trim() || null : null,
        resource_type,
        resource_id,
        due_date: typeof body.due_date === "string" && body.due_date ? body.due_date : null,
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    await logActivity({
      event_type: "teacher_created_assignment",
      actor_id: user.id,
      actor_type: "teacher",
      target_type: "assignment",
      target_id: (assignment as { id: string }).id,
      teacher_id: user.id,
      context: { title, resource_type },
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err) {
    console.error("[class/assignments:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
