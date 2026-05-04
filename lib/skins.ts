export type SkinId =
  | "default"
  | "napoleon_hat"
  | "egypt_crown"
  | "viking_helmet"
  | "louis_wig"
  | "scholar_hat"
  | "knight_helmet"
  | "roman_laurel"
  | "greek_helmet"
  | "musketeer_hat"
  | "pharaoh_mask"
  | "resistance_beret"
  | "plague_doctor"
  | "samurai_helmet";

export type SkinUnlockCondition =
  | "default"
  | "10_games"
  | "25_games"
  | "50_games"
  | "75_games"
  | "100_games"
  | "streak_3"
  | "streak_7"
  | "perfect_score"
  | "daily_master"
  | "quiz_master"
  | "premium";

export type SkinRarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export type Skin = {
  id: SkinId;
  name: string;
  emoji: string;
  unlockCondition: SkinUnlockCondition;
  description: string;
  rarity: SkinRarity;
  period: string;
};

export const SKINS: Skin[] = [
  {
    id: "default",
    name: "Explorateur",
    emoji: "🧑",
    unlockCondition: "default",
    description: "Ton avatar de base",
    rarity: "common",
    period: "Aventure",
  },
  {
    id: "scholar_hat",
    name: "Savant",
    emoji: "🎓",
    unlockCondition: "10_games",
    description: "Débloqué après 10 parties jouées",
    rarity: "common",
    period: "Savoir",
  },
  {
    id: "roman_laurel",
    name: "Consul romain",
    emoji: "🏛️",
    unlockCondition: "25_games",
    description: "Débloqué après 25 parties jouées",
    rarity: "rare",
    period: "Antiquité",
  },
  {
    id: "knight_helmet",
    name: "Chevalier",
    emoji: "🛡️",
    unlockCondition: "streak_3",
    description: "Débloqué avec un streak de 3 jours",
    rarity: "rare",
    period: "Moyen Âge",
  },
  {
    id: "napoleon_hat",
    name: "Napoléonien",
    emoji: "🎩",
    unlockCondition: "50_games",
    description: "Débloqué après 50 parties jouées",
    rarity: "rare",
    period: "Empire",
  },
  {
    id: "musketeer_hat",
    name: "Mousquetaire",
    emoji: "⚔️",
    unlockCondition: "75_games",
    description: "Débloqué après 75 parties jouées",
    rarity: "epic",
    period: "Époque moderne",
  },
  {
    id: "viking_helmet",
    name: "Viking",
    emoji: "⛑️",
    unlockCondition: "streak_7",
    description: "Débloqué avec un streak de 7 jours",
    rarity: "epic",
    period: "Haut Moyen Âge",
  },
  {
    id: "egypt_crown",
    name: "Prince d’Égypte",
    emoji: "👑",
    unlockCondition: "100_games",
    description: "Débloqué après 100 parties jouées",
    rarity: "epic",
    period: "Égypte antique",
  },
  {
    id: "louis_wig",
    name: "Cour de Versailles",
    emoji: "👱",
    unlockCondition: "perfect_score",
    description: "Débloqué après un score parfait en ligne du temps",
    rarity: "legendary",
    period: "Grand Siècle",
  },
  {
    id: "greek_helmet",
    name: "Hoplite grec",
    emoji: "🏺",
    unlockCondition: "quiz_master",
    description: "Débloqué en maîtrisant les quiz Antiquité",
    rarity: "legendary",
    period: "Grèce antique",
  },
  {
    id: "pharaoh_mask",
    name: "Masque pharaonique",
    emoji: "𓁹",
    unlockCondition: "daily_master",
    description: "Débloqué avec une série de défis quotidiens",
    rarity: "legendary",
    period: "Égypte antique",
  },
  {
    id: "resistance_beret",
    name: "Résistant",
    emoji: "🕊️",
    unlockCondition: "daily_master",
    description: "Débloqué après plusieurs défis quotidiens réussis",
    rarity: "epic",
    period: "XXe siècle",
  },
  {
    id: "plague_doctor",
    name: "Médecin de peste",
    emoji: "🐦‍⬛",
    unlockCondition: "premium",
    description: "Skin exclusif premium",
    rarity: "mythic",
    period: "Moyen Âge",
  },
  {
    id: "samurai_helmet",
    name: "Samouraï",
    emoji: "🎌",
    unlockCondition: "premium",
    description: "Skin exclusif premium",
    rarity: "mythic",
    period: "Japon féodal",
  },
];

export function getSkinById(id?: string | null): Skin {
  return SKINS.find((skin) => skin.id === id) ?? SKINS[0];
}

export function isSkinUnlocked(
  skinId: string,
  unlockedSkins: string[] | null | undefined
): boolean {
  return (unlockedSkins ?? ["default"]).includes(skinId);
}

export function getRarityLabel(rarity: SkinRarity): string {
  switch (rarity) {
    case "common":
      return "Commun";
    case "rare":
      return "Rare";
    case "epic":
      return "Épique";
    case "legendary":
      return "Légendaire";
    case "mythic":
      return "Mythique";
  }
}