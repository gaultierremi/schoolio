import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-browser";
import type { Duel } from "@/lib/types";

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

export async function saveDuelResult(duel: Duel): Promise<void> {
  const supabase   = createClient();
  const hostScore  = duel.host_score  ?? 0;
  const guestScore = duel.guest_score ?? 0;
  let winnerId:   string | null = null;
  let winnerName: string | null = null;
  if (hostScore > guestScore) {
    winnerId   = duel.host_id;
    winnerName = duel.host_name;
  } else if (guestScore > hostScore) {
    winnerId   = duel.guest_id;
    winnerName = duel.guest_name;
  }
  const { error } = await supabase.from("duel_results").insert({
    duel_id:     duel.id,
    host_id:     duel.host_id,
    host_name:   duel.host_name,
    host_score:  hostScore,
    guest_id:    duel.guest_id,
    guest_name:  duel.guest_name,
    guest_score: guestScore,
    winner_id:   winnerId,
    winner_name: winnerName,
  });
  if (error) console.error("saveDuelResult:", error.message);
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

export type DuelLeaderboardEntry = {
  user_id:   string;
  user_name: string;
  wins:      number;
  games:     number;
};

export async function getDuelLeaderboard(
  supabase: SupabaseClient
): Promise<DuelLeaderboardEntry[]> {
  type Row = {
    host_id:    string;
    host_name:  string;
    guest_id:   string | null;
    guest_name: string | null;
    winner_id:  string | null;
  };
  const { data, error } = await supabase
    .from("duel_results")
    .select("host_id, host_name, guest_id, guest_name, winner_id");
  if (error) throw new Error(error.message);

  const map = new Map<string, DuelLeaderboardEntry>();
  function ensure(id: string, name: string) {
    if (!map.has(id)) map.set(id, { user_id: id, user_name: name, wins: 0, games: 0 });
    return map.get(id)!;
  }
  for (const row of (data ?? []) as Row[]) {
    ensure(row.host_id, row.host_name).games += 1;
    if (row.guest_id && row.guest_name) ensure(row.guest_id, row.guest_name).games += 1;
    if (row.winner_id) {
      const e = map.get(row.winner_id);
      if (e) e.wins += 1;
    }
  }
  return [...map.values()]
    .sort((a, b) => b.wins - a.wins || b.games - a.games)
    .slice(0, 10);
}

export type RecentDuelRow = {
  id:          string;
  host_name:   string;
  guest_name:  string | null;
  host_score:  number;
  guest_score: number;
  winner_name: string | null;
  created_at:  string;
};

export async function getRecentDuels(
  supabase: SupabaseClient
): Promise<RecentDuelRow[]> {
  const { data, error } = await supabase
    .from("duel_results")
    .select("id, host_name, guest_name, host_score, guest_score, winner_name, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as RecentDuelRow[];
}
