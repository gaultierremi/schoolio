import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-browser";

// ─── Save (called from client components) ────────────────────────────────────

export async function saveQuizScore(
  userId: string,
  userName: string,
  difficulty: number,
  score: number,
  maxScore: number
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("quiz_scores").insert({
    user_id:   userId,
    user_name: userName,
    difficulty,
    score,
    max_score: maxScore,
  });
  if (error) console.error("saveQuizScore:", error.message);
}

// ─── Read (accept any Supabase client) ───────────────────────────────────────

export type QuizLeaderboardEntry = {
  user_id:     string;
  user_name:   string;
  best_score:  number;
  games:       number;
  total_score: number;
};

export async function getQuizLeaderboard(
  supabase: SupabaseClient
): Promise<QuizLeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("quiz_scores")
    .select("user_id, user_name, score");
  if (error) throw new Error(error.message);

  const map = new Map<string, QuizLeaderboardEntry>();
  for (const row of (data ?? []) as { user_id: string; user_name: string; score: number }[]) {
    const e = map.get(row.user_id);
    if (e) {
      e.best_score   = Math.max(e.best_score, row.score);
      e.games       += 1;
      e.total_score += row.score;
    } else {
      map.set(row.user_id, {
        user_id:     row.user_id,
        user_name:   row.user_name,
        best_score:  row.score,
        games:       1,
        total_score: row.score,
      });
    }
  }
  return [...map.values()]
    .sort((a, b) => b.best_score - a.best_score)
    .slice(0, 10);
}

