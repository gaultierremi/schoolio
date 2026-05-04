export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAdaptiveQuestions } from "@/lib/adaptive";
import type { QuizDifficulty } from "@/lib/types";

export async function GET(request: NextRequest) {
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const difficulty = Math.max(
      1,
      Math.min(3, Number(searchParams.get("difficulty") ?? "1"))
    ) as QuizDifficulty;
    const count = Math.max(
      1,
      Math.min(20, Number(searchParams.get("count") ?? "10"))
    );

    const questions = await getAdaptiveQuestions(user.id, difficulty, count);
    return NextResponse.json({ questions });
  } catch (err) {
    console.error("adaptive-questions:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
