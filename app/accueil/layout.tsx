import type { ReactNode } from "react";
import Header from "@/components/Header";
import { getUserWithRole } from "@/lib/auth/role";
import NavSidebar from "./_components/NavSidebar";
import NavBottom from "./_components/NavBottom";

/**
 * Layout partagé pour toutes les pages /accueil/* (Sprint 1.5).
 *
 * Architecture nav role-aware :
 * - Desktop (≥ lg) : sidebar gauche fixed avec items role-spécifiques
 * - Mobile (< lg) : bottom nav avec 5 items max
 * - Header global top reste sticky (logo Maïa + UserMenu)
 *
 * Le rôle est résolu server-side via getUserWithRole(). Pour un user au rôle
 * inconnu, on rend juste le children sans nav (le dispatcher /accueil affiche
 * <UnknownRoleScreen /> dans ce cas).
 */
export default async function AccueilLayout({ children }: { children: ReactNode }) {
  const { user, role } = await getUserWithRole();

  // Densité role-aware (Sprint 1.5) — exposed via data-attribute pour
  // que les composants/CSS rules futures puissent en tirer parti :
  //   - élève "aere"   : padding plus généreux, line-height 1.6, touch-min 48px
  //   - prof  "compact" : densité info supérieure, line-height 1.5
  // Cf. design-system/MASTER.md §Spacing.
  const density = role === "student" ? "aere" : "compact";

  return (
    <div
      data-density={density}
      className="min-h-dvh bg-slate-50 dark:bg-slate-950"
    >
      <Header />
      {user && role && <NavSidebar role={role} />}
      {/*
        Sprint 1.5 polish (a11y) : id="main-content" est la cible du skip link
        global dans app/layout.tsx. tabIndex={-1} permet au focus de s'y poser
        après activation du skip link (sinon le focus n'est pas réceptif sur un
        <main> sans tabindex).
      */}
      <main
        id="main-content"
        tabIndex={-1}
        className={user && role ? "lg:pl-64 pb-16 lg:pb-0 outline-none" : "outline-none"}
      >
        {children}
      </main>
      {user && role && <NavBottom role={role} />}
    </div>
  );
}
