import type { ReactNode } from "react";
import { requireTeacherPage } from "@/lib/auth/role";

/**
 * Server-side guard for /accueil/classes/* — prof only.
 *
 * Q3 sécurité béton : protège toute l'arborescence classes en server-side,
 * indépendamment de la nature client/server des pages enfants.
 */
export default async function ClassesLayout({ children }: { children: ReactNode }) {
  await requireTeacherPage();
  return <>{children}</>;
}
