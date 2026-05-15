import type { ReactNode } from "react";
import { requireTeacherPage } from "@/lib/auth/role";

/**
 * Server guard for /accueil/live/[id] — prof console only.
 *
 * The sibling /accueil/live/page.tsx (lobby) stays open to both roles. Only
 * the in-session console is protected — students cannot host sessions.
 */
export default async function LiveSessionLayout({ children }: { children: ReactNode }) {
  await requireTeacherPage();
  return <>{children}</>;
}
