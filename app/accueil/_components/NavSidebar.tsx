"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  House,
  Mail,
  Radio,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/lib/auth/role";

/**
 * Sidebar desktop role-aware (Sprint 1.5).
 *
 * Conforme design-system/MASTER.md §Navigation :
 * - 256px expanded, 64px collapsed
 * - Items role-spécifiques avec icône Lucide + label
 * - État actif : bg primary-bg-subtle + text-primary + bordure gauche
 * - Hidden < lg breakpoint (mobile utilise NavBottom)
 */
type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Match exact si le path est précis (e.g. `/accueil`), sinon préfixe. */
  exact?: boolean;
};

const ELEVE_ITEMS: NavItem[] = [
  { href: "/accueil", label: "Accueil", Icon: House, exact: true },
  { href: "/accueil/devoirs", label: "Devoirs", Icon: Mail },
  { href: "/accueil/live", label: "Live", Icon: Radio, exact: true },
];

const PROF_ITEMS: NavItem[] = [
  { href: "/accueil", label: "Accueil", Icon: House, exact: true },
  { href: "/accueil/classes", label: "Classes", Icon: Users },
  { href: "/accueil/cours", label: "Cours", Icon: BookOpen },
  { href: "/accueil/curation", label: "Curation", Icon: CheckSquare },
  { href: "/accueil/import", label: "Import", Icon: Upload },
  { href: "/accueil/horaire", label: "Horaire", Icon: Calendar },
  { href: "/accueil/live", label: "Live", Icon: Radio, exact: true },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export default function NavSidebar({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const items = role === "student" ? ELEVE_ITEMS : PROF_ITEMS;

  return (
    <aside
      className={`fixed left-0 top-14 z-10 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200 dark:border-slate-800 dark:bg-slate-950 lg:flex ${
        collapsed ? "w-16" : "w-64"
      }`}
      aria-label="Navigation principale"
    >
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "border-l-2 border-indigo-600 bg-indigo-50 pl-[10px] text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/30 dark:text-indigo-300"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <item.Icon size={18} strokeWidth={1.75} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Étendre le menu" : "Réduire le menu"}
          className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}

// Re-export item lists for NavBottom to share the same source of truth.
export { ELEVE_ITEMS, PROF_ITEMS, type NavItem };
