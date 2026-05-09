"use client";
import Link from "next/link";

const ACTIONS = [
  {
    label: "Importer un PDF",
    icon: "📄",
    href: "/school/import",
    colorClass: "border-purple-500/20 bg-purple-500/10 hover:bg-purple-500/20",
    textClass: "text-purple-300",
  },
  {
    label: "Créer une classe",
    icon: "🏫",
    href: "/school/classes/new",
    colorClass: "border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20",
    textClass: "text-blue-300",
  },
  {
    label: "Lancer une session",
    icon: "🎮",
    href: "/school/session/new",
    colorClass: "border-green-500/20 bg-green-500/10 hover:bg-green-500/20",
    textClass: "text-green-300",
  },
  {
    label: "Gérer les devoirs",
    icon: "📝",
    href: "/school/classes",
    colorClass: "border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20",
    textClass: "text-amber-300",
  },
  {
    label: "Générer des exercices",
    icon: "⚡",
    href: "/school/courses",
    colorClass: "border-cyan-500/20 bg-cyan-500/10 hover:bg-cyan-500/20",
    textClass: "text-cyan-300",
  },
  {
    label: "Mes questions",
    icon: "📚",
    href: "/school/questions",
    colorClass: "border-gray-700 bg-gray-800 hover:bg-gray-700",
    textClass: "text-gray-300",
  },
] as const;

export default function QuickActions() {
  return (
    <section>
      <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-gray-500">
        Actions rapides
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ACTIONS.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className={`flex flex-col items-center justify-center gap-2 rounded-2xl border p-5 text-center transition ${action.colorClass}`}
          >
            <span className="text-2xl">{action.icon}</span>
            <span className={`text-sm font-bold ${action.textClass}`}>
              {action.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
