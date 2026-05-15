import type { ReactNode } from "react";
import { requireTeacherPage } from "@/lib/auth/role";

export default async function OrganisationLayout({ children }: { children: ReactNode }) {
  await requireTeacherPage();
  return <>{children}</>;
}
