// Sprint 0.5 — minimal identity editor.
// Skin system, titles, badges, XP grid removed per spec §2.2 + 2026-05-13 directive.
// Per-subject progression % will live on /student dashboard (Sprint 4).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import ProfileMinimal from "./ProfileMinimal";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mon profil · Maïa",
};

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await admin()
    .from("user_profiles")
    .select("first_name, last_name, user_name, avatar_color")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <ProfileMinimal
      initialProfile={{
        first_name: profile?.first_name ?? "",
        last_name: profile?.last_name ?? "",
        user_name: profile?.user_name ?? "",
        avatar_color: profile?.avatar_color ?? "#f59e0b",
      }}
    />
  );
}
