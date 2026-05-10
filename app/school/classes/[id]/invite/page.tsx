import { redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import InvitePageClient from "./InvitePageClient";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://schoolio-two.vercel.app";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function ClassInvitePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/");

  const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
  if (isTeacher !== true) redirect("/");

  const admin = createAdminClient();

  const { data: cls } = await admin
    .from("classes")
    .select("id, name, invitation_code, invitation_enabled, invitation_expires_at")
    .eq("id", params.id)
    .eq("teacher_id", user.id)
    .maybeSingle();

  if (!cls) redirect("/school/classes");

  // If no invitation_code yet (migration not run), show placeholder
  if (!cls.invitation_code) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-10 text-white">
        <div className="mx-auto max-w-2xl">
          <a href={`/school/classes/${params.id}`} className="text-xs text-gray-500 hover:text-gray-400">
            ← {cls.name}
          </a>
          <div className="mt-8 rounded-2xl border border-amber-800/40 bg-amber-950/20 px-5 py-6 text-center">
            <p className="text-2xl">⚠️</p>
            <p className="mt-3 font-bold text-amber-300">Migration requise</p>
            <p className="mt-1 text-sm text-zinc-400">
              Exécute la migration <code>20260512000000_class_invitation_code.sql</code> dans Supabase pour activer les codes d&apos;invitation.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { count: memberCount } = await admin
    .from("class_memberships")
    .select("id", { count: "exact", head: true })
    .eq("class_id", params.id)
    .eq("status", "active");

  const joinUrl = `${SITE_URL}/join?code=${cls.invitation_code}`;

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <InvitePageClient
          classId={cls.id}
          className={cls.name}
          invitationCode={cls.invitation_code}
          invitationEnabled={cls.invitation_enabled ?? true}
          invitationExpiresAt={cls.invitation_expires_at ?? null}
          memberCount={memberCount ?? 0}
          joinUrl={joinUrl}
        />
      </div>
    </main>
  );
}
