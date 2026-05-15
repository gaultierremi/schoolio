"use client";
import Link from "next/link";
import {
  Upload, School, Play, PencilLine, Zap, CalendarDays, type LucideIcon,
} from "lucide-react";

type Action = {
  label: string;
  Icon: LucideIcon;
  href: string;
  containerClass: string;
  iconClass: string;
  textClass: string;
};

const ACTIONS: Action[] = [
  {
    label: "Importer un PDF",
    Icon: Upload,
    href: "/accueil/import",
    containerClass: "border-[rgb(var(--accent))]/20 bg-[rgb(var(--accent-soft))]/20 hover:bg-[rgb(var(--accent-soft))]/40",
    iconClass: "text-[rgb(var(--accent))]",
    textClass: "text-[rgb(var(--accent))]",
  },
  {
    label: "Créer une classe",
    Icon: School,
    href: "/school/classes/new",
    containerClass: "border-blue-400/20 bg-blue-50 hover:bg-blue-100",
    iconClass: "text-blue-600",
    textClass: "text-blue-700",
  },
  {
    label: "Lancer une session",
    Icon: Play,
    href: "/accueil/session/nouvelle",
    containerClass: "border-[rgb(var(--green))]/20 bg-[rgb(var(--green))]/5 hover:bg-[rgb(var(--green))]/10",
    iconClass: "text-[rgb(var(--green))]",
    textClass: "text-[rgb(var(--green))]",
  },
  {
    label: "Gérer les devoirs",
    Icon: PencilLine,
    href: "/school/classes",
    containerClass: "border-[rgb(var(--warm))]/20 bg-[rgb(var(--warm))]/5 hover:bg-[rgb(var(--warm))]/10",
    iconClass: "text-[rgb(var(--warm))]",
    textClass: "text-[rgb(var(--warm))]",
  },
  {
    label: "Gérer les exercices",
    Icon: Zap,
    href: "/accueil/cours",
    containerClass: "border-cyan-400/20 bg-cyan-50 hover:bg-cyan-100",
    iconClass: "text-cyan-700",
    textClass: "text-cyan-700",
  },
  {
    label: "Mon horaire",
    Icon: CalendarDays,
    href: "/accueil/horaire",
    containerClass: "border-indigo-400/20 bg-indigo-50 hover:bg-indigo-100",
    iconClass: "text-indigo-700",
    textClass: "text-indigo-700",
  },
];

export default function QuickActions() {
  return (
    <section>
      <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
        Actions rapides
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ACTIONS.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className={`flex flex-col items-center justify-center gap-2 rounded-2xl border p-5 text-center transition ${action.containerClass}`}
          >
            <action.Icon className={`h-6 w-6 ${action.iconClass}`} aria-hidden />
            <span className={`text-sm font-bold ${action.textClass}`}>
              {action.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
