// Source de vérité pour les matières et niveaux scolaires de Schoolio.
// Compatible avec l'ancienne API (SUBJECTS as array, SubjectId) ET la nouvelle (typed Record, niveaux scolaires).

export const SUBJECTS = [
  { id: "histoire",       label: "Histoire",            emoji: "🏛️", color: "amber",  category: "humanites" as const, description: "Périodes, événements, civilisations" },
  { id: "chimie",         label: "Chimie",              emoji: "⚗️", color: "blue",   category: "sciences" as const,   description: "Atomes, molécules, réactions" },
  { id: "physique",       label: "Physique",            emoji: "🔬", color: "cyan",   category: "sciences" as const,   description: "Forces, énergie, mécanique, électricité" },
  { id: "biologie",       label: "Biologie",            emoji: "🧬", color: "green",  category: "sciences" as const,   description: "Cellules, organismes, écosystèmes" },
  { id: "sciences",       label: "Sciences (général)",  emoji: "🧪", color: "blue",   category: "sciences" as const,   description: "Sciences sans discipline précise" },
  { id: "mathematiques",  label: "Mathématiques",       emoji: "📐", color: "green",  category: "sciences" as const,   description: "Algèbre, géométrie, analyse" },
  { id: "geographie",     label: "Géographie",          emoji: "🌍", color: "teal",   category: "humanites" as const,  description: "Pays, climats, populations" },
  { id: "litterature",    label: "Littérature",         emoji: "📚", color: "purple", category: "langues" as const,    description: "Œuvres, auteurs, analyses" },
  { id: "francais",       label: "Français",            emoji: "🇫🇷", color: "red",    category: "langues" as const,    description: "Grammaire, expression, littérature" },
  { id: "anglais",        label: "Anglais",             emoji: "🇬🇧", color: "blue",   category: "langues" as const,    description: "Vocabulaire, grammaire, compréhension" },
  { id: "neerlandais",    label: "Néerlandais",         emoji: "🇳🇱", color: "orange", category: "langues" as const,    description: "Vocabulaire, grammaire, compréhension" },
  { id: "droit",          label: "Droit",               emoji: "⚖️", color: "red",    category: "autre" as const,      description: "Lois, jurisprudence, institutions" },
  { id: "medecine",       label: "Médecine & Anatomie", emoji: "🩺", color: "pink",   category: "autre" as const,      description: "Anatomie, physiologie, pathologies" },
  { id: "permis",         label: "Code de la route",    emoji: "🚗", color: "orange", category: "autre" as const,      description: "Règles, signalisation, sécurité" },
  { id: "langues",        label: "Langues (autre)",     emoji: "💬", color: "indigo", category: "langues" as const,    description: "Autre langue non listée" },
  { id: "autre",          label: "Autre",               emoji: "✨", color: "gray",   category: "autre" as const,      description: "Toute autre matière" },
] as const;

export type SubjectId = (typeof SUBJECTS)[number]["id"];
export type SchoolSubject = SubjectId;  // alias pour la nouvelle API

export type SubjectMeta = (typeof SUBJECTS)[number];
export type SubjectCategory = "sciences" | "langues" | "humanites" | "autre";

// Helper Record pour accès O(1) par id (utile pour le nouveau code)
export const SUBJECTS_BY_ID: Record<SubjectId, SubjectMeta> = SUBJECTS.reduce(
  (acc, s) => ({ ...acc, [s.id]: s }),
  {} as Record<SubjectId, SubjectMeta>
);

// Niveaux scolaires (système belge secondaire)
export type SchoolLevel = 1 | 2 | 3 | 4 | 5 | 6;

export const LEVELS: { id: SchoolLevel; label: string; shortLabel: string }[] = [
  { id: 1, label: "1ère secondaire", shortLabel: "1ère" },
  { id: 2, label: "2ème secondaire", shortLabel: "2ème" },
  { id: 3, label: "3ème secondaire", shortLabel: "3ème" },
  { id: 4, label: "4ème secondaire", shortLabel: "4ème" },
  { id: 5, label: "5ème secondaire", shortLabel: "5ème" },
  { id: 6, label: "6ème secondaire", shortLabel: "6ème" },
];

// Helper pour récupérer le contexte d'un cours pour les prompts IA
export function getSubjectContext(subject: SubjectId, level?: SchoolLevel | null): string {
  const meta = SUBJECTS_BY_ID[subject];
  if (!level) return `${meta.label} (niveau secondaire)`;
  return `${meta.label} - ${level}ème secondaire`;
}

// Validation pour les routes API
export function isValidSubject(value: unknown): value is SubjectId {
  return typeof value === "string" && value in SUBJECTS_BY_ID;
}

export function isValidLevel(value: unknown): value is SchoolLevel {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;
}
