import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { updateStudyProgress } from "@/lib/study-session";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = (await request.json()) as {
      sessionId: string;
      questionId: string;
      correct: boolean;
    };

    await updateStudyProgress(body.sessionId, body.questionId, body.correct);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("study-progress:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
