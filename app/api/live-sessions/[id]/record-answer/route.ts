import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f-]{36}$/i;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST { question_id, answer_index } → record student answer, return is_correct
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: "sessionId invalide" }, { status: 400 });
    }

    const body = await req.json() as { question_id?: string; answer_index?: number };

    if (!body.question_id || !UUID_REGEX.test(body.question_id)) {
      return NextResponse.json({ error: "question_id invalide" }, { status: 400 });
    }
    if (typeof body.answer_index !== "number" || body.answer_index < 0) {
      return NextResponse.json({ error: "answer_index invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: session } = await admin
      .from("live_sessions")
      .select("id, ended_at, projected_question_id, class_id")
      .eq("id", params.id)
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (session.ended_at) return NextResponse.json({ error: "Session terminée" }, { status: 410 });
    if (session.projected_question_id !== body.question_id) {
      return NextResponse.json({ error: "Cette question n'est pas actuellement projetée" }, { status: 409 });
    }

    // Verify student is in the class (if session has a class)
    if (session.class_id) {
      const { data: membership } = await admin
        .from("class_memberships")
        .select("student_user_id")
        .eq("class_id", session.class_id)
        .eq("student_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ error: "Non membre de cette classe" }, { status: 403 });
      }
    }

    const { data: question } = await admin
      .from("teacher_questions")
      .select("answer_index")
      .eq("id", body.question_id)
      .maybeSingle();

    if (!question) return NextResponse.json({ error: "Question introuvable" }, { status: 404 });

    const correctIndex = question.answer_index as number;
    const isCorrect = body.answer_index === correctIndex;

    const { error: insertError } = await admin
      .from("live_question_answers")
      .upsert({
        live_session_id: params.id,
        question_id: body.question_id,
        student_user_id: user.id,
        answer_index: body.answer_index,
        is_correct: isCorrect,
        answered_at: new Date().toISOString(),
      }, { onConflict: "live_session_id,question_id,student_user_id" });

    if (insertError) throw insertError;

    return NextResponse.json({ is_correct: isCorrect });
  } catch (err) {
    console.error("[live-sessions/[id]/record-answer:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
