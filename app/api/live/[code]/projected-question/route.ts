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
    const upperCode = params.code.toUpperCase();
    console.log("[projected-question] === START, code:", upperCode);

    // Direct REST fetch bypasses supabase-js client processing so we can see
    // exactly what PostgREST returns without any SDK transformation.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const restUrl =
      `${supabaseUrl}/rest/v1/live_sessions` +
      `?code=eq.${upperCode}` +
      `&select=id,projected_question_id,show_answer,ended_at` +
      `&order=started_at.desc` +
      `&limit=1`;

    const rawRes = await fetch(restUrl, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    console.log("[projected-question] REST status:", rawRes.status);
    const rawText = await rawRes.text();
    console.log("[projected-question] REST raw body:", rawText);

    if (!rawRes.ok) {
      console.error("[projected-question] REST error response");
      return NextResponse.json({ error: "Erreur réseau Supabase" }, { status: 500 });
    }

    const sessions = JSON.parse(rawText) as Array<{
      id: string;
      projected_question_id: string | null;
      show_answer: boolean;
      ended_at: string | null;
    }>;

    const session = sessions?.[0] ?? null;
    console.log("[projected-question] parsed session:", JSON.stringify(session));
    console.log("[projected-question] session.projected_question_id:", session?.projected_question_id);

    if (!session) {
      return NextResponse.json({ error: "Session introuvable ou terminée" }, { status: 404 });
    }

    if (!session.projected_question_id) {
      console.log("[projected-question] projected_question_id null/undefined → projected:false");
      return NextResponse.json({ projected: false });
    }

    const admin = createAdminClient();

    const { data: question, error: qError } = await admin
      .from("teacher_questions")
      .select("id, question, options, answer_index, explanation, page_range_start, page_range_end, origin")
      .eq("id", session.projected_question_id)
      .maybeSingle();

    console.log("[projected-question] question fetch:", JSON.stringify({ found: !!question, qError: qError?.message }));
    if (qError) throw qError;
    if (!question) {
      return NextResponse.json({ projected: false });
    }

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
      page_range_start: question.page_range_start,
      page_range_end: question.page_range_end,
      origin: question.origin,
      show_answer: showAnswer,
    };

    if (showAnswer) {
      response.correct_answer_letter = String.fromCharCode(65 + answerIndex);
      response.explanation = question.explanation ?? null;
    }

    console.log("[projected-question] returning projected:true, show_answer:", showAnswer);
    return NextResponse.json(response);
  } catch (err) {
    console.error("[live/[code]/projected-question:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
