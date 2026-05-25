import type { ReactNode } from "react";

/**
 * Layout pass-through pour /accueil/devoirs.
 *
 * Avant 2026-05-24, ce layout faisait `requireStudentPage()` car toutes
 * les pages /accueil/devoirs/* étaient student-only. Désormais l'INDEX
 * `/accueil/devoirs` est role-aware (prof voit ses devoirs aggrégés).
 *
 * Le guard student strict est déplacé dans `app/accueil/devoirs/[id]/layout.tsx`
 * qui couvre les sous-routes student-only (DETAIL + QUIZ + BILAN).
 */
export default function DevoirsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
