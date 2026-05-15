import { redirect } from "next/navigation";
import { getRoleOrNull } from "@/lib/auth/role";
import EleveHome from "./_components/EleveHome";
import ProfHome from "./_components/ProfHome";

export const dynamic = "force-dynamic";

/**
 * Page d'accueil rôle-aware sur `/accueil`.
 *
 * - Élève (`app_metadata.role === "student"`) → <EleveHome />
 * - Prof (`app_metadata.role === "teacher"`) → <ProfHome />
 * - Non authentifié OU rôle inconnu → redirect /login
 *
 * Server-side check via `getRoleOrNull()` (lit `app_metadata`, jamais
 * `user_metadata` — règle interne #1 CLAUDE.md).
 */
export default async function AccueilPage() {
  const role = await getRoleOrNull();
  if (!role) redirect("/login");
  if (role === "student") return <EleveHome />;
  return <ProfHome />;
}
