import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import BetaAdminClient from "./BetaAdminClient";

export const dynamic = "force-dynamic";

// Auth is handled by app/admin/layout.tsx (ADMIN_EMAILS check)

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function BetaWhitelistPage() {
  const admin = createAdminClient();

  const [whitelistRes, pendingRes, historyRes] = await Promise.all([
    admin
      .from("beta_whitelist")
      .select("id, email, added_at, source, notes")
      .order("added_at", { ascending: false }),

    admin
      .from("beta_access_requests")
      .select("id, email, full_name, message, requested_at, status")
      .eq("status", "pending")
      .order("requested_at", { ascending: true }),

    admin
      .from("beta_access_requests")
      .select("id, email, full_name, message, requested_at, reviewed_at, status")
      .in("status", ["approved", "rejected"])
      .order("reviewed_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">

        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-400">
            Admin · Schoolio
          </p>
          <h1 className="mt-1 text-3xl font-black text-white">
            Gestion bêta
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Whitelist d&apos;accès à la bêta privée
          </p>
        </div>

        <BetaAdminClient
          whitelist={whitelistRes.data ?? []}
          pendingRequests={pendingRes.data ?? []}
          history={(historyRes.data ?? []) as Parameters<typeof BetaAdminClient>[0]["history"]}
        />

      </div>
    </main>
  );
}
