import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z2-9]{6}$/;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET → public endpoint for display page to fetch the currently projected question.
// correct_answer is ONLY returned when show_answer=true.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!CODE_RE.test(code.toUpperCase())) {
    return NextResponse.json({ error: "Code session invalide" }, { status: 400 });
  }

  try {
    const { data: session, error: sessionError } = await admin()
      .from("cockpit_sessions")
      .select("projected_question_id, show_answer, ended_at")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (session.ended_at) return NextResponse.json({ projected: false });
    if (!session.projected_question_id) return NextResponse.json({ projected: false });

    const { data: question, error: qError } = await admin()
      .from("cockpit_questions")
      .select("id, question, options, answer_index, explanation, origin, page_start, page_end")
      .eq("id", session.projected_question_id)
      .maybeSingle();

    if (qError) throw qError;
    if (!question) return NextResponse.json({ projected: false });

    const options = question.options as string[];
    const answerIndex = question.answer_index as number;
    const showAnswer = session.show_answer as boolean;

    const mappedOptions = options.map((text, i) => {
      const letter = String.fromCharCode(65 + i);
      const base = { letter, text };
      return showAnswer ? { ...base, is_correct: i === answerIndex } : base;
    });

    const response: Record<string, unknown> = {
      projected: true,
      id: question.id,
      question: question.question,
      options: mappedOptions,
      page_range_start: question.page_start,
      page_range_end: question.page_end,
      origin: question.origin,
      show_answer: showAnswer,
    };

    if (showAnswer) {
      response.correct_answer_letter = String.fromCharCode(65 + answerIndex);
      response.explanation = question.explanation ?? null;
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error("[cockpit/display/[code]/projected-question:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
