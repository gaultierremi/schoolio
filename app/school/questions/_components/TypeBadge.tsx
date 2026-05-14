// Le pipeline génère mcq / numeric / short_text. truefalse + multi_step sont
// supportés pour rétrocompatibilité avec d'éventuelles questions legacy.
export type QuestionTypeLabel =
  | "mcq"
  | "truefalse"
  | "numeric"
  | "short_text"
  | "multi_step";

function labelFor(type: string): string {
  switch (type) {
    case "mcq":
      return "QCM";
    case "numeric":
      return "Numérique";
    case "short_text":
      return "Réponse libre";
    case "truefalse":
      return "V/F";
    case "multi_step":
      return "Multi-étapes";
    default:
      return type;
  }
}

function colorsFor(type: string): string {
  switch (type) {
    case "mcq":
      return "bg-blue-100 text-blue-700";
    case "numeric":
      return "bg-amber-100 text-amber-700";
    case "short_text":
      return "bg-emerald-100 text-emerald-700";
    case "truefalse":
      return "bg-purple-100 text-purple-700";
    case "multi_step":
      return "bg-fuchsia-100 text-fuchsia-700";
    default:
      return "bg-[rgb(var(--surface-3))] text-[rgb(var(--ink-2))]";
  }
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-black uppercase ${colorsFor(type)}`}
    >
      {labelFor(type)}
    </span>
  );
}
