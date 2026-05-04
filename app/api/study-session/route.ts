import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createStudySession } from "@/lib/study-session";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = (await req.json()) as {
      subject?: string;
      source?: string;
      questionCount?: number;
      mode?: string;
      difficulty?: number;
      topic?: string;
    };

    const sessionId = await createStudySession(user.id, {
      subject: body.subject ?? "autre",
      source: body.source ?? "library",
      questionCount: body.questionCount ?? 10,
      mode: (body.mode === "adaptive" ? "adaptive" : "normal") as "normal" | "adaptive",
      difficulty: body.difficulty ?? 1,
      topic: body.topic,
    });

    return NextResponse.json({ ok: true, sessionId });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
