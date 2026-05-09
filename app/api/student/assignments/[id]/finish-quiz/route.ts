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

type FinishBody = {
  score?: unknown;
  duration_seconds?: unknown;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const body = (await req.json()) as FinishBody;
    const score = typeof body.score === "number" ? body.score : null;
    const duration_seconds =
      typeof body.duration_seconds === "number" ? Math.round(body.duration_seconds) : null;

    if (score === null || score < 0 || score > 100) {
      return NextResponse.json({ error: "Score invalide (0–100)" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: assignment } = await admin
      .from("assignments")
      .select("id, class_id, resource_type")
      .eq("id", params.id)
      .is("archived_at", null)
      .maybeSingle();

    if (!assignment) return NextResponse.json({ error: "Devoir introuvable" }, { status: 404 });
    if (assignment.resource_type !== "quiz") {
      return NextResponse.json({ error: "Ce devoir n'est pas un quiz" }, { status: 400 });
    }

    const { data: membership } = await admin
      .from("class_memberships")
      .select("id")
      .eq("class_id", assignment.class_id)
      .eq("student_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    // Get existing to keep best score
    const { data: existing } = await admin
      .from("assignment_completions")
      .select("score")
      .eq("assignment_id", params.id)
      .eq("student_user_id", user.id)
      .maybeSingle();

    const bestScore =
      existing?.score !== null && existing?.score !== undefined
        ? Math.max(Number(existing.score), score)
        : score;

    const now = new Date().toISOString();

    await admin.from("assignment_completions").upsert({
      assignment_id: params.id,
      student_user_id: user.id,
      status: "completed",
      score: bestScore,
      duration_seconds,
      completed_at: now,
      last_attempt_at: now,
    }, { onConflict: "assignment_id,student_user_id" });

    const { data: clsData } = await admin
      .from("classes")
      .select("teacher_id")
      .eq("id", assignment.class_id)
      .maybeSingle();
    if (clsData && typeof clsData.teacher_id === "string") {
      await logActivity({
        event_type: "student_completed_quiz",
        actor_id: user.id,
        actor_type: "student",
        target_type: "assignment",
        target_id: params.id,
        teacher_id: clsData.teacher_id,
        context: { score: bestScore },
      });
    }

    return NextResponse.json({ ok: true, score: bestScore });
  } catch (err) {
    console.error("[finish-quiz:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
