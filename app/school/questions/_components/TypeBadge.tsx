export function TypeBadge({ type }: { type: "mcq" | "truefalse" }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-black uppercase ${
        type === "mcq"
          ? "bg-blue-500/20 text-blue-300"
          : "bg-purple-500/20 text-purple-300"
      }`}
    >
      {type === "mcq" ? "QCM" : "V/F"}
    </span>
  );
}
