import Link from "next/link";

const LINKS = [
  { href: "/train", emoji: "🎯", label: "Entraînement", sub: "Quiz libre" },
  { href: "/study/review", emoji: "🔁", label: "Révision", sub: "Concepts dus" },
  { href: "/study/stats", emoji: "📊", label: "Statistiques", sub: "Ma progression" },
] as const;

export default function ExplorerFooter() {
  return (
    <div>
      <h2 className="mb-3 text-lg font-black text-white">🚀 Explorer</h2>
      <div className="grid grid-cols-3 gap-3">
        {LINKS.map(({ href, emoji, label, sub }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-gray-800 bg-gray-900 p-4 text-center transition hover:border-purple-500/40"
          >
            <span className="text-2xl">{emoji}</span>
            <span className="text-xs font-bold text-white">{label}</span>
            <span className="text-[10px] text-gray-500">{sub}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
