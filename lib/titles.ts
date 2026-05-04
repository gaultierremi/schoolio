export type TitleId =
  | "explorer"
  | "apprentice_scholar"
  | "archivist"
  | "chronomancer"
  | "time_guardian"
  | "master_historian"
  | "living_legend"
  | "duelist"
  | "daily_champion"
  | "emperor";

export type Title = {
  id: TitleId;
  name: string;
  description: string;
  rarity: "common" | "rare" | "epic" | "legendary";
};

export const TITLES: Title[] = [
  { id: "explorer", name: "Explorateur", description: "Début de ton voyage", rarity: "common" },
  { id: "apprentice_scholar", name: "Apprenti érudit", description: "10 parties jouées", rarity: "common" },
  { id: "archivist", name: "Archiviste", description: "Maîtrise du quiz", rarity: "rare" },
  { id: "chronomancer", name: "Chronomancien", description: "Expert de la timeline", rarity: "rare" },
  { id: "time_guardian", name: "Gardien du temps", description: "Streak élevé", rarity: "epic" },
  { id: "master_historian", name: "Maître historien", description: "50+ parties", rarity: "epic" },
  { id: "living_legend", name: "Légende vivante", description: "100+ parties", rarity: "legendary" },
  { id: "duelist", name: "Dueliste", description: "Multi-joueur actif", rarity: "rare" },
  { id: "daily_champion", name: "Champion quotidien", description: "Défis journaliers", rarity: "epic" },
  { id: "emperor", name: "Empereur du temps", description: "Titre ultime", rarity: "legendary" },
];

export function getTitleById(id?: string | null) {
  return TITLES.find((t) => t.id === id) ?? TITLES[0];
}