export function TypeBadge({ type }: { type: "mcq" | "truefalse" }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-black uppercase ${
        type === "mcq"
          ? "bg-blue-100 text-blue-700"
          : "bg-purple-100 text-purple-700"
      }`}
    >
      {type === "mcq" ? "QCM" : "V/F"}
    </span>
  );
}
