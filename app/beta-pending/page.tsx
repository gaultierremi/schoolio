import { redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import RequestForm from "./RequestForm";
import SignOutButton from "@/app/student/_components/SignOutButton";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function BetaPendingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const email = user.email ?? "";
  const admin = createAdminClient();

  // Check existing request
  const { data: existing } = await admin
    .from("beta_access_requests")
    .select("status")
    .ilike("email", email)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const requestStatus = (existing?.status ?? "none") as "none" | "pending" | "approved" | "rejected";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12">
      <div className="w-full max-w-md space-y-8">

        {/* Logo + titre */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-purple-400">
            🎓 Schoolio
          </div>
          <h1 className="mt-5 text-3xl font-black text-white">
            Schoolio est en bêta privée
          </h1>
          <p className="mt-2 text-base text-zinc-400">
            Ton accès n&apos;est pas encore activé
          </p>
        </div>

        {/* Email connecté */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-center text-sm text-zinc-400">
          Connecté en tant que{" "}
          <span className="font-semibold text-white">{email}</span>
        </div>

        {/* Formulaire / statut */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-zinc-300">Demander l&apos;accès</h2>
          <RequestForm initialStatus={requestStatus} />
        </div>

        {/* Déconnexion */}
        <div className="text-center">
          <SignOutButton />
        </div>

        {/* Contact */}
        <p className="text-center text-xs text-zinc-600">
          Questions ?{" "}
          <a href="mailto:gaultierremi@gmail.com" className="text-zinc-500 hover:text-zinc-300">
            gaultierremi@gmail.com
          </a>
        </p>

      </div>
    </main>
  );
}
