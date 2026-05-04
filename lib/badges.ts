export type BadgeId =
  | "first_game"
  | "ten_games"
  | "fifty_games"
  | "hundred_games"
  | "streak_3"
  | "streak_7"
  | "quiz_expert"
  | "timeline_master"
  | "daily_winner"
  | "founder";

export type Badge = {
  id: BadgeId;
  name: string;
  emoji: string;
  description: string;
};

export const BADGES: Badge[] = [
  { id: "first_game", name: "Premier pas", emoji: "👶", description: "Première partie" },
  { id: "ten_games", name: "Actif", emoji: "🎮", description: "10 parties" },
  { id: "fifty_games", name: "Passionné", emoji: "🔥", description: "50 parties" },
  { id: "hundred_games", name: "Vétéran", emoji: "🏆", description: "100 parties" },
  { id: "streak_3", name: "Régulier", emoji: "📅", description: "3 jours de streak" },
  { id: "streak_7", name: "Dévoué", emoji: "⚡", description: "7 jours de streak" },
  { id: "quiz_expert", name: "Expert quiz", emoji: "🧠", description: "Maîtrise du quiz" },
  { id: "timeline_master", name: "Maître du temps", emoji: "⏳", description: "Expert timeline" },
  { id: "daily_winner", name: "Champion du jour", emoji: "🥇", description: "Top daily" },
  { id: "founder", name: "Fondateur", emoji: "👑", description: "Early supporter" },
];

export function getBadgeById(id?: string | null) {
  return BADGES.find((b) => b.id === id);
}