import type { ReactNode } from "react";
import Header from "@/components/Header";

/**
 * Layout partagé pour toutes les pages /accueil/*.
 *
 * Le routing role-aware est géré par les `page.tsx` individuelles via
 * `requireStudentPage()` / `requireTeacherPage()` / `getRoleOrNull()`
 * depuis `@/lib/auth/role`.
 *
 * Le branding Header (Schoolio → Maïa) est traité en Sprint 0 Phase F (F1).
 * La nav role-aware sidebar desktop + bottom nav mobile arrivera dans un
 * sprint ultérieur, selon design-system/MASTER.md.
 */
export default function AccueilLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
      <Header />
      <main>{children}</main>
    </div>
  );
}
