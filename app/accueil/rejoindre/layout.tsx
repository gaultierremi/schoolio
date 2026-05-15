import type { ReactNode } from "react";
import { requireStudentPage } from "@/lib/auth/role";

/**
 * Server-side guard for /accueil/rejoindre/[code] — élève join-by-code.
 *
 * Teachers don't join sessions, they host them. A teacher hitting this
 * route is redirected to /accueil (dispatcher → ProfHome).
 */
export default async function RejoindreLayout({ children }: { children: ReactNode }) {
  await requireStudentPage();
  return <>{children}</>;
}
