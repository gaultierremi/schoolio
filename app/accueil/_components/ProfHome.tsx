import { requireTeacherPage } from "@/lib/auth/role";
import ProfDashboardClient from "./prof/ProfDashboardClient";

/**
 * Dashboard professeur — migré depuis /school/page.tsx (Sprint 0 Task D1).
 *
 * Server component qui valide le rôle teacher avec sécurité béton (Q3) puis
 * rend le client component qui fetch les data du dashboard côté navigateur.
 *
 * Densité compact prof (max-w-4xl, p-4) déjà appliquée dans le client.
 */
export default async function ProfHome() {
  await requireTeacherPage();
  return <ProfDashboardClient />;
}
