import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  inferConceptsFromQuestion,
  tagQuestionWithConcepts,
  updateConceptMastery,
} from "@/lib/concepts";

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

    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = (await request.json()) as {
      questionId: string;
      correct: boolean;
      period: string;
    };

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: rawQ } = await db
      .from("questions")
      .select("answer, period")
      .eq("id", body.questionId)
      .maybeSingle();

    if (!rawQ) return NextResponse.json({ ok: true });

    const q = rawQ as { answer: string; period: string | null };

    const { data: existing } = await db
      .from("question_concepts")
      .select("concept_id")
      .eq("question_id", body.questionId);

    let conceptIds = ((existing ?? []) as { concept_id: string }[]).map(
      (r) => r.concept_id
    );

    if (conceptIds.length === 0) {
      conceptIds = await inferConceptsFromQuestion(
        q.answer,
        q.period ?? body.period
      );
      if (conceptIds.length > 0) {
        await tagQuestionWithConcepts(body.questionId, "anachronism", conceptIds);
      }
    }

    for (const conceptId of conceptIds) {
      await updateConceptMastery(user.id, conceptId, body.correct);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("record-anachronism-answer:", err);
    return NextResponse.json({ ok: true });
  }
}
