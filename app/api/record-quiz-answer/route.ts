import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { recordQuizAnswer } from "@/lib/adaptive";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const body = (await request.json()) as {
      questionId: string;
      questionType: string;
      correct: boolean;
      period: string | null;
      question: string;
    };

    await recordQuizAnswer(
      user.id,
      body.questionId,
      body.questionType,
      body.correct,
      body.period,
      body.question
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("record-quiz-answer:", err);
    return NextResponse.json({ ok: true });
  }
}
