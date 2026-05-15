import { createClient as createSupabaseAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// Singleton admin Supabase client pour Trigger.dev runs + routes server.
// Auto-recovery sur erreur d'auth (JWT expire, session_not_found) via reset.
// Économie mesurée : ~5-15s par run (vs ~50 instanciations à 100-300ms).

// Module-level singleton state. Tests MUST call resetAdminClient() in beforeEach
// pour eviter cross-test contamination.
let _adminPromise: Promise<SupabaseClient> | null = null;

function buildAdmin(): SupabaseClient {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: {
        // Trigger.dev cloud runtime = Node 21, sans WebSocket natif. Le SDK
        // Supabase initialise RealtimeClient au boot → throw sans polyfill.
        // (Pattern reproduit depuis lib/observability/log-error.ts:17-32.)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transport: WebSocket as any,
      },
    },
  );
}

export function getAdminClient(): Promise<SupabaseClient> {
  if (!_adminPromise) {
    _adminPromise = Promise.resolve(buildAdmin());
  }
  return _adminPromise;
}

export function resetAdminClient(): void {
  _adminPromise = null;
}

export async function withAdminClient<T>(
  fn: (admin: SupabaseClient) => Promise<T>,
): Promise<T> {
  const admin = await getAdminClient();
  try {
    return await fn(admin);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Service-role bypasses RLS (donc pas de PGRST301 attendu). On retry uniquement
    // sur expiration JWT ou session disparue cote Supabase.
    if (msg.includes("JWT") || msg.includes("session_not_found")) {
      resetAdminClient();
      const fresh = await getAdminClient();
      return await fn(fresh);
    }
    throw err;
  }
}
