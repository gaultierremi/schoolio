import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import JoinTokenClient from "./JoinTokenClient";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function JoinTokenPage({
  params,
}: {
  params: { token: string };
}) {
  const admin = createAdminClient();

  const { data: cls } = await admin
    .from("classes")
    .select("id, name, archived_at, teacher_id")
    .eq("invite_link_token", params.token)
    .maybeSingle();

  if (!cls || cls.archived_at) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 py-12 text-center">
        <p className="text-5xl">🔗</p>
        <h1 className="mt-6 text-2xl font-black text-white">
          Lien invalide ou expiré
        </h1>
        <p className="mt-3 text-sm text-gray-400">
          Ce lien d&apos;invitation n&apos;existe pas ou la classe a été
          archivée.
        </p>
        <a
          href="/join"
          className="mt-6 inline-block rounded-2xl border border-gray-700 px-5 py-2.5 text-sm font-bold text-gray-300 transition hover:border-gray-500 hover:text-white"
        >
          ← Entrer un code à la place
        </a>
      </main>
    );
  }

  const { data: teacherProfile } = await admin
    .from("user_profiles")
    .select("user_name")
    .eq("id", cls.teacher_id)
    .maybeSingle();

  return (
    <JoinTokenClient
      classId={cls.id}
      className={cls.name}
      teacherName={teacherProfile?.user_name ?? undefined}
    />
  );
}
