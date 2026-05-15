import { redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import ConsentAdulteClient from "./ConsentAdulteClient";

export const dynamic = "force-dynamic";

/**
 * Page consent RGPD post-SSO (Sprint 1A).
 *
 * Sprint 1A scope : adultes (≥16 ans) uniquement. Le workflow parent mineur
 * arrive en Sprint 1B (cf. mémoire project_consent_parental_minor).
 *
 * Server component :
 * - Si déjà consenti (consent_records row signed_at NOT NULL) → redirect next
 * - Sinon → affiche le formulaire
 */
export default async function ConsentRgpdPage({
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

  const { data: existing } = await admin
    .from("consent_records")
    .select("id")
    .eq("student_user_id", user.id)
    .not("signed_at", "is", null)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  const nextParam =
    searchParams.next && searchParams.next.startsWith("/")
      ? searchParams.next
      : "/onboarding/pin-setup";

  if (existing) {
    redirect(nextParam);
  }

  return <ConsentAdulteClient nextParam={nextParam} userEmail={user.email ?? ""} />;
}
