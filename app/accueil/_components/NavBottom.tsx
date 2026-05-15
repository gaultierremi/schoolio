"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CheckSquare,
  House,
  Mail,
  Radio,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/lib/auth/role";

/**
 * Bottom navigation mobile role-aware (Sprint 1.5).
 *
 * Conforme design-system/MASTER.md §Navigation :
 * - 5 items max, hauteur 64px
 * - Icône Lucide + label compact text-xs
 * - État actif : text-primary + bg primary-bg-subtle
 * - Visible < lg (hidden lg:hidden inverse)
 * - Touch target min 48px hauteur (élève aéré)
 */
type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
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
  { href: "/accueil/curation", label: "Curation", Icon: CheckSquare },
  { href: "/accueil/cours", label: "Cours", Icon: BookOpen },
  { href: "/accueil/import", label: "Import", Icon: Upload },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export default function NavBottom({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const items = role === "student" ? ELEVE_ITEMS : PROF_ITEMS;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex h-16 items-stretch border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-950 lg:hidden"
      aria-label="Navigation principale"
    >
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 px-2 transition-colors ${
              active
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <item.Icon size={20} strokeWidth={active ? 2 : 1.75} />
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
