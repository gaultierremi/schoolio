import type { ReactNode } from "react";
import { requireStudentPage } from "@/lib/auth/role";

/**
 * Layout server-side guard for /accueil/devoirs/*.
 *
 * Q3 "sécurité béton" : chaque page (devoirs index, detail, quiz) est
 * protégée car ses children sont des Client Components qui ne peuvent
 * pas appeler `requireStudentPage()` directement.
 *
 * Le layout fait le check une fois en server-side, l'arborescence entière
 * est cloisonnée aux students. Un teacher tape /accueil/devoirs/... →
 * redirect /accueil (dispatcher → ProfHome).
 */
export default async function DevoirsLayout({ children }: { children: ReactNode }) {
  await requireStudentPage();
  return <>{children}</>;
}
