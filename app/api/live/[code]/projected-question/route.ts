import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET → public endpoint for slave page to fetch the currently projected question.
// correct_answer_letter and explanation are ONLY returned when show_answer=true.
export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } },
) {
  try {
    const admin = createAdminClient();

    const { data: session, error: sessionError } = await admin
      .from("live_sessions")
      .select("id, projected_question_id, show_answer, ended_at")
      .eq("code", params.code.toUpperCase())
      .is("ended_at", null)
      .maybeSingle();

    if (sessionError) throw sessionError;
    console.log("[projected-question] session:", JSON.stringify({ found: !!session, projected_question_id: session?.projected_question_id, show_answer: session?.show_answer, ended_at: session?.ended_at }));
    if (!session) return NextResponse.json({ error: "Session introuvable ou terminée" }, { status: 404 });

    if (!session.projected_question_id) {
      console.log("[projected-question] no projected_question_id → projected:false");
      return NextResponse.json({ projected: false });
    }

    const { data: question, error: qError } = await admin
      .from("teacher_questions")
      .select("id, question, options, answer_index, explanation, page_range_start, page_range_end, origin")
      .eq("id", session.projected_question_id)
      .maybeSingle();

    console.log("[projected-question] question fetch:", JSON.stringify({ found: !!question, qError: qError?.message }));
    if (qError) throw qError;
    if (!question) {
      console.log("[projected-question] question not found for id:", session.projected_question_id);
      return NextResponse.json({ projected: false });
    }

    const options = question.options as string[];
    const answerIndex = question.answer_index as number;
    const showAnswer = session.show_answer as boolean;

    // Map options to letter objects; is_correct only revealed with show_answer
    const mappedOptions = options.map((text, i) => {
      const letter = String.fromCharCode(65 + i); // A, B, C, D
      const base = { letter, text };
      return showAnswer ? { ...base, is_correct: i === answerIndex } : base;
    });

    const response: Record<string, unknown> = {
      projected: true,
      id: question.id,
      question: question.question,
      options: mappedOptions,
      page_range_start: question.page_range_start,
      page_range_end: question.page_range_end,
      origin: question.origin,
      show_answer: showAnswer,
    };

    if (showAnswer) {
      response.correct_answer_letter = String.fromCharCode(65 + answerIndex);
      response.explanation = question.explanation ?? null;
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error("[live/[code]/projected-question:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
