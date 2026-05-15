import type { ReactNode } from "react";
import { requireTeacherPage } from "@/lib/auth/role";

/**
 * Server-side guard for /accueil/session/* — prof only (création de live).
 * L'élève rejoint un live via /accueil/rejoindre/[code], pas via /session.
 */
export default async function SessionLayout({ children }: { children: ReactNode }) {
  await requireTeacherPage();
  return <>{children}</>;
}
