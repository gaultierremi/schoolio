import { createClient } from "@supabase/supabase-js";
import { ClearCacheButton } from "./ClearCacheButton";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Quota = {
  id: string;
  display_name: string;
  requests_today: number;
  daily_limit: number;
  cooldown_until: string | null;
  eu_compliant: boolean;
  priority: number;
};

type LogRow = {
  id: string;
  provider_id: string | null;
  task_type: string;
  status: string;
  latency_ms: number | null;
  tokens_used: number | null;
  error_message: string | null;
  created_at: string;
};

type CacheStats = {
  total: number;
  total_hits: number;
};

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    success: "bg-green-900 text-green-300",
    cached: "bg-blue-900 text-blue-300",
    quota_exceeded: "bg-yellow-900 text-yellow-300",
    error: "bg-red-900 text-red-300",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-zinc-700 text-zinc-300"}`}>
      {status}
    </span>
  );
}

function cooldownLabel(until: string | null) {
  if (!until) return null;
  const d = new Date(until);
  if (d <= new Date()) return null;
  const mins = Math.ceil((d.getTime() - Date.now()) / 60000);
  return <span className="text-yellow-400 text-xs">cooldown {mins}m</span>;
}

export default async function AIRouterAdminPage() {
  const admin = createAdminClient();

  const [{ data: quotas }, { data: logs }, { data: cacheRows }] = await Promise.all([
    admin
      .from("ai_provider_quotas")
      .select("id, display_name, requests_today, daily_limit, cooldown_until, eu_compliant, priority")
      .order("priority"),
    admin
      .from("ai_request_logs")
      .select("id, provider_id, task_type, status, latency_ms, tokens_used, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("ai_response_cache")
      .select("hit_count")
      .gt("expires_at", new Date().toISOString()),
  ]);

  const typedQuotas = (quotas ?? []) as Quota[];
  const typedLogs = (logs ?? []) as LogRow[];

  const cacheStats: CacheStats = {
    total: cacheRows?.length ?? 0,
    total_hits: (cacheRows ?? []).reduce((sum, r) => sum + ((r as { hit_count: number }).hit_count ?? 0), 0),
  };

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">AI Router</h1>
            <p className="text-sm text-zinc-400">Quotas · Logs · Cache</p>
          </div>
          <ClearCacheButton />
        </div>

        {/* Provider cards */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-200">Fournisseurs ({typedQuotas.length})</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {typedQuotas.map((q) => {
              const pct = Math.min(100, Math.round((q.requests_today / q.daily_limit) * 100));
              const onCooldown = q.cooldown_until && new Date(q.cooldown_until) > new Date();
              return (
                <div
                  key={q.id}
                  className={`rounded-xl border p-4 ${onCooldown ? "border-yellow-700 bg-yellow-950/30" : "border-zinc-800 bg-zinc-900"}`}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <span className="font-medium">{q.display_name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${q.eu_compliant ? "bg-green-900 text-green-300" : "bg-zinc-800 text-zinc-400"}`}
                    >
                      {q.eu_compliant ? "EU ✓" : "non-EU"}
                    </span>
                  </div>
                  <div className="mb-2 text-xs text-zinc-400">
                    {q.requests_today} / {q.daily_limit} req — priorité {q.priority}
                  </div>
                  <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {cooldownLabel(q.cooldown_until)}
                </div>
              );
            })}
          </div>
        </section>

        {/* Cache stats */}
        <section className="flex gap-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-2xl font-bold">{cacheStats.total}</div>
            <div className="text-sm text-zinc-400">Entrées actives</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-2xl font-bold">{cacheStats.total_hits}</div>
            <div className="text-sm text-zinc-400">Hits totaux</div>
          </div>
        </section>

        {/* Request logs */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-200">Dernières requêtes</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-900 text-xs text-zinc-400">
                <tr>
                  {["Provider", "Tâche", "Statut", "Latence", "Tokens", "Date"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {typedLogs.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-900/50">
                    <td className="px-4 py-2 font-mono text-xs text-zinc-400">
                      {row.provider_id ?? "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{row.task_type}</td>
                    <td className="px-4 py-2">{statusBadge(row.status)}</td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {row.latency_ms != null ? `${row.latency_ms}ms` : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {row.tokens_used ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {new Date(row.created_at).toLocaleString("fr-BE", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
                {typedLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                      Aucune requête enregistrée
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
