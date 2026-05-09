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

type QuestionAnswer = {
  question_id: string;
  is_correct: boolean;
  requested_solution: boolean;
  requested_explanation: boolean;
};

type FinishBody = {
  score?: unknown;
  duration_seconds?: unknown;
  question_answers?: unknown;
};

const UUID_REGEX = /^[0-9a-f-]{36}$/i;

function isValidAnswer(v: unknown): v is QuestionAnswer {
  if (!v || typeof v !== "object") return false;
  const qa = v as Record<string, unknown>;
  return (
    typeof qa.question_id === "string" && UUID_REGEX.test(qa.question_id) &&
    typeof qa.is_correct === "boolean" &&
    typeof qa.requested_solution === "boolean" &&
    typeof qa.requested_explanation === "boolean"
  );
}

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

    const question_answers: QuestionAnswer[] = Array.isArray(body.question_answers)
      ? (body.question_answers as unknown[]).filter(isValidAnswer)
      : [];

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

    // Fetch existing completion to preserve best score and OR tracking flags
    const { data: existing } = await admin
      .from("assignment_completions")
      .select("score, requested_solution, requested_explanation")
      .eq("assignment_id", params.id)
      .eq("student_user_id", user.id)
      .maybeSingle();

    const bestScore =
      existing?.score !== null && existing?.score !== undefined
        ? Math.max(Number(existing.score), score)
        : score;

    const thisRequestedSolution = question_answers.some((qa) => qa.requested_solution);
    const thisRequestedExplanation = question_answers.some((qa) => qa.requested_explanation);

    // OR with historical flags — once asked, always recorded
    const finalRequestedSolution = (existing?.requested_solution ?? false) || thisRequestedSolution;
    const finalRequestedExplanation = (existing?.requested_explanation ?? false) || thisRequestedExplanation;

    const now = new Date().toISOString();

    // Insert per-question answers for this attempt
    if (question_answers.length > 0) {
      await admin.from("assignment_question_answers").insert(
        question_answers.map((qa) => ({
          assignment_id: params.id,
          student_user_id: user.id,
          question_id: qa.question_id,
          is_correct: qa.is_correct,
          requested_solution: qa.requested_solution,
          requested_explanation: qa.requested_explanation,
        }))
      );
    }

    await admin.from("assignment_completions").upsert(
      {
        assignment_id: params.id,
        student_user_id: user.id,
        status: "completed",
        score: bestScore,
        duration_seconds,
        completed_at: now,
        last_attempt_at: now,
        requested_solution: finalRequestedSolution,
        requested_explanation: finalRequestedExplanation,
      },
      { onConflict: "assignment_id,student_user_id" }
    );

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
