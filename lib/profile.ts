import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-browser";
import { getQuizLeaderboard } from "@/lib/scores";
import { SKINS, type SkinId } from "@/lib/skins";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserProfile = {
  id: string;
  user_name: string;
  avatar_color: string;
  active_skin: string;
  unlocked_skins: string[];
  streak: number;
  last_played: string | null;
  last_played_date: string | null;
  total_games: number;
  total_score: number;
  created_at: string;
  updated_at: string | null;
};

export type UserStats = UserProfile & {
  best_score: number;
  global_rank: number | null;
  favorite_mode: string | null;
};

export type ProfileUpdateInput = {
  user_name?: string;
  avatar_color?: string;
  active_skin?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeProfile(row: any): UserProfile {
  return {
    ...row,
    active_skin: row.active_skin ?? "default",
    unlocked_skins: Array.isArray(row.unlocked_skins)
      ? row.unlocked_skins
      : ["default"],
    total_games: row.total_games ?? 0,
    total_score: row.total_score ?? 0,
  };
}

function getDefaultProfileInsert(userId: string, userName: string) {
  return {
    id: userId,
    user_name: userName || "Historien mystère",
    avatar_color: "#f59e0b",
    unlocked_skins: ["default"],
    active_skin: "default",
    streak: 0,
    total_games: 0,
    total_score: 0,
  };
}

function calculateEligibleSkins(profile: UserProfile): string[] {
  const unlocked = new Set(profile.unlocked_skins ?? ["default"]);

  unlocked.add("default");

  if (profile.total_games >= 10) unlocked.add("scholar_hat");
  if (profile.total_games >= 25) unlocked.add("roman_laurel");
  if (profile.total_games >= 50) unlocked.add("napoleon_hat");
  if (profile.total_games >= 75) unlocked.add("musketeer_hat");
  if (profile.total_games >= 100) unlocked.add("egypt_crown");

  if (profile.streak >= 3) unlocked.add("knight_helmet");
  if (profile.streak >= 7) unlocked.add("viking_helmet");

  return Array.from(unlocked);
}

// ─── Server-side functions ────────────────────────────────────────────────────

export async function getOrCreateProfile(
  supabase: SupabaseClient,
  userId: string,
  userName: string
): Promise<UserProfile> {
  const { data: existing } = await supabase
    .from("user_profiles")
    .select()
    .eq("id", userId)
    .maybeSingle();

  if (existing) return normalizeProfile(existing);

  const { data: created, error } = await supabase
    .from("user_profiles")
    .insert(getDefaultProfileInsert(userId, userName))
    .select()
    .single();

  if (error) {
    const { data: refetch } = await supabase
      .from("user_profiles")
      .select()
      .eq("id", userId)
      .single();

    if (!refetch) throw new Error("Impossible de créer le profil utilisateur");
    return normalizeProfile(refetch);
  }

  return normalizeProfile(created);
}

export async function getProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select()
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeProfile(data) : null;
}

export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  updates: ProfileUpdateInput
): Promise<UserProfile> {
  const cleanUpdates: ProfileUpdateInput & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (typeof updates.user_name === "string") {
    cleanUpdates.user_name = updates.user_name.trim().slice(0, 32);
  }

  if (typeof updates.avatar_color === "string") {
    cleanUpdates.avatar_color = updates.avatar_color;
  }

  if (typeof updates.active_skin === "string") {
    const profile = await getProfile(supabase, userId);
    const unlockedSkins = profile?.unlocked_skins ?? ["default"];

    if (!unlockedSkins.includes(updates.active_skin)) {
      throw new Error("Ce skin n'est pas encore débloqué.");
    }

    cleanUpdates.active_skin = updates.active_skin;
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .update(cleanUpdates)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return normalizeProfile(data);
}

export async function updateStreak(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: row } = await supabase
    .from("user_profiles")
    .select("streak, last_played_date")
    .eq("id", userId)
    .maybeSingle();

  if (!row) return;

  const today = new Date().toISOString().slice(0, 10);
  const { streak, last_played_date } = row as {
    streak: number;
    last_played_date: string | null;
  };

  if (last_played_date === today) return;

  const prev = new Date();
  prev.setUTCDate(prev.getUTCDate() - 1);
  const yesterday = prev.toISOString().slice(0, 10);

  const newStreak = last_played_date === yesterday ? streak + 1 : 1;

  await supabase
    .from("user_profiles")
    .update({
      streak: newStreak,
      last_played_date: today,
      last_played: today,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  await unlockEligibleSkins(supabase, userId);
}

export async function unlockSkin(
  supabase: SupabaseClient,
  userId: string,
  skinId: SkinId
): Promise<void> {
  const { data: row } = await supabase
    .from("user_profiles")
    .select("unlocked_skins")
    .eq("id", userId)
    .maybeSingle();

  if (!row) return;

  const skins = Array.isArray(row.unlocked_skins)
    ? row.unlocked_skins
    : ["default"];

  if (skins.includes(skinId)) return;

  await supabase
    .from("user_profiles")
    .update({
      unlocked_skins: [...skins, skinId],
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

export async function unlockEligibleSkins(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const profile = await getProfile(supabase, userId);
  if (!profile) return [];

  const eligibleSkins = calculateEligibleSkins(profile);

  const hasNewSkin =
    eligibleSkins.length !== profile.unlocked_skins.length ||
    eligibleSkins.some((skin) => !profile.unlocked_skins.includes(skin));

 if (hasNewSkin) {
  await supabase
    .from("user_profiles")
    .update({
      unlocked_skins: eligibleSkins,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  console.log("🎉 Nouveaux skins débloqués :", eligibleSkins);
}

  return eligibleSkins;
}

export async function getUserStats(
  supabase: SupabaseClient,
  userId: string
): Promise<UserStats | null> {
  const profile = await getProfile(supabase, userId);
  if (!profile) return null;

  const [
    { count: quizGames },
    { count: dailyGames },
    quizBestResult,
    leaderboard,
  ] = await Promise.all([
    supabase
      .from("quiz_scores")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("daily_scores")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("quiz_scores")
      .select("score")
      .eq("user_id", userId)
      .order("score", { ascending: false })
      .limit(1),
    getQuizLeaderboard(supabase),
  ]);

  const computedTotalGames = (quizGames ?? 0) + (dailyGames ?? 0);
  const best_score =
    (quizBestResult.data?.[0] as { score: number } | undefined)?.score ?? 0;

  const rankIndex = leaderboard.findIndex((entry) => entry.user_id === userId);
  const global_rank = rankIndex >= 0 ? rankIndex + 1 : null;

  const favorite_mode =
    (dailyGames ?? 0) >= (quizGames ?? 0)
      ? "Ligne du temps"
      : (quizGames ?? 0) > 0
      ? "Quiz"
      : null;

  return {
    ...profile,
    total_games: Math.max(profile.total_games ?? 0, computedTotalGames),
    best_score,
    global_rank,
    favorite_mode,
  };
}

// ─── Client-side functions ────────────────────────────────────────────────────

export async function updateStreakClient(userId: string): Promise<void> {
  const supabase = createClient();
  return updateStreak(supabase, userId);
}

export async function updateProfileClient(
  userId: string,
  updates: ProfileUpdateInput
): Promise<UserProfile> {
  const supabase = createClient();
  return updateProfile(supabase, userId, updates);
}

export async function unlockEligibleSkinsClient(
  userId: string
): Promise<string[]> {
  const supabase = createClient();
  return unlockEligibleSkins(supabase, userId);
}