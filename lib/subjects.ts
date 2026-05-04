export const SUBJECTS = [
  { id: "histoire",      label: "Histoire",           emoji: "🏛️", color: "amber"  },
  { id: "sciences",      label: "Sciences",            emoji: "🔬", color: "blue"   },
  { id: "mathematiques", label: "Mathématiques",       emoji: "📐", color: "green"  },
  { id: "geographie",    label: "Géographie",          emoji: "🌍", color: "teal"   },
  { id: "litterature",   label: "Littérature",         emoji: "📚", color: "purple" },
  { id: "droit",         label: "Droit",               emoji: "⚖️", color: "red"    },
  { id: "medecine",      label: "Médecine & Anatomie", emoji: "🩺", color: "pink"   },
  { id: "permis",        label: "Code de la route",    emoji: "🚗", color: "orange" },
  { id: "langues",       label: "Langues",             emoji: "💬", color: "indigo" },
  { id: "autre",         label: "Autre",               emoji: "✨", color: "gray"   },
] as const;

export type SubjectId = (typeof SUBJECTS)[number]["id"];
