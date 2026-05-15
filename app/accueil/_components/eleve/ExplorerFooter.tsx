import Link from "next/link";
import { Target, RefreshCw, BarChart3, Rocket } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const LINKS: { href: string; Icon: LucideIcon; label: string; sub: string }[] = [
  { href: "/train", Icon: Target, label: "Entraînement", sub: "Quiz libre" },
  { href: "/study/review", Icon: RefreshCw, label: "Révision", sub: "Concepts dus" },
  { href: "/study/stats", Icon: BarChart3, label: "Statistiques", sub: "Ma progression" },
];

export default function ExplorerFooter() {
  return (
    <div>
      <h2 className="serif mb-3 flex items-center gap-2 text-lg font-black text-[rgb(var(--ink))]">
        <Rocket className="h-5 w-5 text-[rgb(var(--accent))]" aria-hidden />
        Explorer
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {LINKS.map(({ href, Icon, label, sub }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-center transition hover:border-[rgb(var(--accent))]/40 hover:bg-[rgb(var(--surface-3))]"
          >
            <Icon className="h-6 w-6 text-[rgb(var(--accent))]" aria-hidden />
            <span className="text-xs font-bold text-[rgb(var(--ink))]">{label}</span>
            <span className="text-[10px] text-[rgb(var(--ink-3))]">{sub}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
