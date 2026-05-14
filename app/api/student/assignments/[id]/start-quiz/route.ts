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

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const admin = createAdminClient();

    const { data: assignment } = await admin
      .from("assignments")
      .select("id, class_id, resource_type, resource_id")
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

    // Upsert completion: in_progress, increment attempts
    const { data: existing } = await admin
      .from("assignment_completions")
      .select("attempts_count, score")
      .eq("assignment_id", params.id)
      .eq("student_user_id", user.id)
      .maybeSingle();

    const now = new Date().toISOString();

    await admin.from("assignment_completions").upsert({
      assignment_id: params.id,
      student_user_id: user.id,
      status: "in_progress",
      attempts_count: (existing?.attempts_count ?? 0) + 1,
      last_attempt_at: now,
      // Preserve best score
      score: existing?.score ?? null,
    }, { onConflict: "assignment_id,student_user_id" });

    // Check for pre-sampled question list (85/15 mix)
    const { data: sampledRows } = await admin
      .from("assignment_questions")
      .select("question_id")
      .eq("assignment_id", params.id);

    let questions;
    if (sampledRows && sampledRows.length > 0) {
      const ids = (sampledRows as { question_id: string }[]).map((r) => r.question_id);
      const { data: qs, error: qErr } = await admin
        .from("teacher_questions")
        .select("id, question, options, answer_index, type, difficulty_stars, explanation, concept_page_hint, page_range_start, correction_steps, concept_id")
        .in("id", ids)
        .not("validated_at", "is", null)
        .is("rejected_at", null);
      if (qErr) throw qErr;
      questions = qs;
    } else {
      const { data: qs, error: qErr } = await admin
        .from("teacher_questions")
        .select("id, question, options, answer_index, type, difficulty_stars, explanation, concept_page_hint, page_range_start, correction_steps, concept_id")
        .eq("course_id", assignment.resource_id)
        .not("validated_at", "is", null)
        .is("rejected_at", null)
        .order("created_at", { ascending: true });
      if (qErr) throw qErr;
      questions = qs;
    }

    if (!questions || questions.length === 0) {
      return NextResponse.json({ error: "Aucune question disponible pour ce quiz" }, { status: 400 });
    }

    const { data: clsData } = await admin
      .from("classes")
      .select("teacher_id")
      .eq("id", assignment.class_id)
      .maybeSingle();
    if (clsData && typeof clsData.teacher_id === "string") {
      await logActivity({
        event_type: "student_started_quiz",
        actor_id: user.id,
        actor_type: "student",
        target_type: "assignment",
        target_id: params.id,
        teacher_id: clsData.teacher_id,
      });
    }

    return NextResponse.json({ questions });
  } catch (err) {
    console.error("[start-quiz:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
