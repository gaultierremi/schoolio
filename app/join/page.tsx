import { redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import JoinClassForm from "./JoinClassForm";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const code = searchParams.code?.trim().toUpperCase() ?? "";

  // Authenticated user: check if already whitelisted
  if (user) {
    const email = user.email?.toLowerCase() ?? "";
    const admin = createAdminClient();
    const { data: whitelisted } = await admin
      .from("beta_whitelist")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    // Already whitelisted with no code → go to dashboard
    if (whitelisted && !code) {
      redirect("/student");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-purple-400">
            🎓 Schoolio
          </div>
          <h1 className="mt-4 text-3xl font-black text-white">
            Rejoindre une classe
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Entre le code donné par ton professeur
          </p>
        </div>

        {/* Non-authenticated: show login prompt if no code, else show form with login button inside */}
        {!user && !code ? (
          <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-center text-sm text-zinc-400">
              Connecte-toi d&apos;abord avec ton compte Google pour rejoindre une classe.
            </p>
            <JoinClassForm initialCode={code} />
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            {user ? (
              <p className="mb-4 text-center text-xs text-zinc-500">
                Connecté : <span className="text-zinc-300">{user.email}</span>
              </p>
            ) : null}
            <JoinClassForm initialCode={code} />
          </div>
        )}

        <p className="text-center text-xs text-zinc-700">
          Tu as déjà un compte ?{" "}
          <a href="/" className="text-zinc-500 hover:text-zinc-300">
            Accéder à Schoolio
          </a>
        </p>

      </div>
    </main>
  );
}
