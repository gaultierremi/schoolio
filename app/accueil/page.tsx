import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth/role";
import EleveHome from "./_components/EleveHome";
import ProfHome from "./_components/ProfHome";
import UnknownRoleScreen from "./_components/UnknownRoleScreen";

export const dynamic = "force-dynamic";

/**
 * Page d'accueil rôle-aware sur `/accueil`.
 *
 * Trois branches :
 * - Non authentifié → redirect /login
 * - Authentifié + rôle = "student" → <EleveHome />
 * - Authentifié + rôle = "teacher" → <ProfHome />
 * - Authentifié + rôle inconnu (manquant, "admin", legacy...) → <UnknownRoleScreen />
 *   (évite la boucle /accueil ↔ /login pour les comptes mal configurés)
 *
 * Server-side check via `getUserWithRole()` (lit `app_metadata`, jamais
 * `user_metadata` — règle interne #1 CLAUDE.md).
 */
export default async function AccueilPage() {
  const { user, role } = await getUserWithRole();
  if (!user) redirect("/login");
  if (role === "student") return <EleveHome />;
  if (role === "teacher") return <ProfHome />;
  return <UnknownRoleScreen email={user.email} />;
}
