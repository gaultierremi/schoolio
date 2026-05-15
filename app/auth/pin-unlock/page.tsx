import { redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import PinUnlockClient from "./PinUnlockClient";

export const dynamic = "force-dynamic";

/**
 * Page re-auth quotidienne PIN (Sprint 1A).
 *
 * Server component qui :
 * - Redirect /login si pas auth
 * - Redirect /onboarding/pin-setup si aucun PIN configuré
 * - Délègue le formulaire au client PinUnlockClient
 */
export default async function PinUnlockPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: pinRow } = await admin
    .from("user_pin")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const nextParam =
    searchParams.next && searchParams.next.startsWith("/")
      ? searchParams.next
      : "/accueil";

  if (!pinRow) {
    redirect(`/onboarding/pin-setup?next=${encodeURIComponent(nextParam)}`);
  }

  return <PinUnlockClient nextParam={nextParam} userEmail={user.email ?? ""} />;
}
