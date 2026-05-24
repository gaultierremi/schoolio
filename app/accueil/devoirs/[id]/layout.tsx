import type { ReactNode } from "react";
import { requireStudentPage } from "@/lib/auth/role";

/**
 * Layout server-side guard pour /accueil/devoirs/[id]/* (DETAIL + QUIZ + BILAN).
 *
 * Q3 "sécurité béton" : chaque sous-page délègue le check ici. Un prof qui
 * tape /accueil/devoirs/<id>/quiz → redirect /accueil.
 *
 * Note : l'INDEX `/accueil/devoirs` est désormais role-aware (PR Devoirs
 * sidebar prof, 2026-05-24) — son guard est géré dans page.tsx via
 * `getUserWithRole()`.
 */
export default async function DevoirsDetailLayout({ children }: { children: ReactNode }) {
  await requireStudentPage();
  return <>{children}</>;
}
