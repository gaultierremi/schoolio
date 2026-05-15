import { redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import PinSetupClient from "./PinSetupClient";

export const dynamic = "force-dynamic";

/**
 * Page setup PIN après 1er SSO (Sprint 1A).
 *
 * Server component qui :
 * - Vérifie l'auth (sinon /login)
 * - Vérifie l'absence de PIN existant (sinon /accueil)
 * - Délègue le formulaire au client component PinSetupClient
 */
export default async function PinSetupPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Si un PIN existe déjà → pas de re-setup direct. L'utilisateur doit passer
  // par "PIN oublié" sur /auth/pin-unlock.
  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: pinRow } = await admin
    .from("user_pin")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pinRow) {
    const nextParam = searchParams.next && searchParams.next.startsWith("/")
      ? searchParams.next
      : "/accueil";
    redirect(nextParam);
  }

  const nextParam = searchParams.next && searchParams.next.startsWith("/")
    ? searchParams.next
    : "/accueil";

  return <PinSetupClient nextParam={nextParam} userEmail={user.email ?? ""} />;
}
