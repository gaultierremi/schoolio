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
      <main className={user && role ? "lg:pl-64 pb-16 lg:pb-0" : ""}>{children}</main>
      {user && role && <NavBottom role={role} />}
    </div>
  );
}
