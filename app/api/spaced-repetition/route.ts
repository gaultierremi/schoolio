import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type MasteryRow = {
  mastery_score: number;
  correct: number;
  attempts: number;
  easiness_factor: number | null;
  interval_days: number | null;
  review_count: number | null;
};

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

    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const body = (await req.json()) as {
      questionId: string;
      questionType?: string;
      correct: boolean;
      responseTime?: number; // seconds
    };

    const { questionId, correct, responseTime = 10 } = body;

    const db = getDb();

    // Get concept IDs linked to this question
    const { data: linkRows } = await db
      .from("question_concepts")
      .select("concept_id")
      .eq("question_id", questionId);

    const conceptIds = ((linkRows ?? []) as { concept_id: string }[]).map(
      (r) => r.concept_id
    );

    if (conceptIds.length === 0) {
      return NextResponse.json({ nextReview: null, masteryScore: 0, streak: 0 });
    }

    const now = new Date();
    let lastNextReview = new Date(now.getTime() + 86_400_000);
    let totalMastery = 0;
    let maxStreak = 0;

    for (const conceptId of conceptIds) {
      // Load existing mastery
      const { data: existing } = await db
        .from("user_concept_mastery")
        .select("mastery_score, correct, attempts, easiness_factor, interval_days, review_count")
        .eq("user_id", user.id)
        .eq("concept_id", conceptId)
        .maybeSingle();

      const row = existing as MasteryRow | null;

      const currentScore = row?.mastery_score ?? 0;
      const currentEF = row?.easiness_factor ?? 2.5;
      const currentInterval = row?.interval_days ?? 1;
      const currentReviewCount = row?.review_count ?? 0;

      // SM-2 algorithm
      let newInterval: number;
      let newEF: number;
      let newReviewCount: number;
      let newScore: number;

      if (correct) {
        newReviewCount = currentReviewCount + 1;
        newScore = Math.min(100, currentScore + 5);

        if (responseTime < 5) {
          // Fast and correct — accelerate
          newInterval = Math.max(1, Math.round(currentInterval * 2.5));
          newEF = Math.min(3.0, currentEF + 0.15);
        } else {
          // Slow but correct — moderate increase
          newInterval = Math.max(1, Math.round(currentInterval * 1.5));
          newEF = currentEF; // unchanged
        }
      } else {
        // Incorrect — reset
        newReviewCount = 0;
        newInterval = 1;
        newEF = Math.max(1.3, currentEF - 0.2);
        newScore = Math.max(0, currentScore - 8);
      }

      const nextReview = new Date(now.getTime() + newInterval * 86_400_000);

      await db.from("user_concept_mastery").upsert(
        {
          user_id: user.id,
          concept_id: conceptId,
          mastery_score: newScore,
          attempts: (row?.attempts ?? 0) + 1,
          correct: (row?.correct ?? 0) + (correct ? 1 : 0),
          last_seen: now.toISOString(),
          next_review: nextReview.toISOString(),
          easiness_factor: newEF,
          interval_days: newInterval,
          review_count: newReviewCount,
        },
        { onConflict: "user_id,concept_id" }
      );

      totalMastery += newScore;
      maxStreak = Math.max(maxStreak, newReviewCount);
      if (nextReview > lastNextReview) lastNextReview = nextReview;
    }

    return NextResponse.json({
      nextReview: lastNextReview.toISOString(),
      masteryScore: Math.round(totalMastery / conceptIds.length),
      streak: maxStreak,
    });
  } catch (err) {
    console.error("spaced-repetition:", err);
    return NextResponse.json({ nextReview: null, masteryScore: 0, streak: 0 });
  }
}
