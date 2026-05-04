import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

const SIMILARITY_THRESHOLD = 0.85;

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { questionId, forcePropose } = (await req.json()) as {
      questionId?: string;
      forcePropose?: boolean;
    };

    if (!questionId) {
      return NextResponse.json({ error: "questionId requis" }, { status: 400 });
    }

    // Fetch source question
    const { data: tq, error: tqError } = await supabase
      .from("teacher_questions")
      .select("type, question, options, answer_index, explanation, period")
      .eq("id", questionId)
      .single();

    if (tqError || !tq) {
      return NextResponse.json(
        { error: "Question introuvable" },
        { status: 404 }
      );
    }

    // Load all quiz_questions text for duplicate check
    const { data: existing } = await supabase
      .from("quiz_questions")
      .select("id, question");

    if (!forcePropose) {
      const normSource = normalize(tq.question as string);

      const duplicate = (
        existing as { id: string; question: string }[] | null ?? []
      ).find(
        (q) => similarity(normSource, normalize(q.question)) > SIMILARITY_THRESHOLD
      );

      if (duplicate) {
        return NextResponse.json({
          duplicate: true,
          similar: duplicate.question,
        });
      }
    }

    // Insert into quiz_questions with status pending
    const { error: insertError } = await supabase
      .from("quiz_questions")
      .insert({
        type: tq.type,
        question: tq.question,
        options: tq.options,
        answer_index: tq.answer_index,
        explanation: tq.explanation ?? null,
        period: tq.period ?? null,
        difficulty: 1,
        status: "pending",
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
