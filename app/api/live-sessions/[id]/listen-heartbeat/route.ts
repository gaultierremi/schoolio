import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiOk, apiError, safeError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f-]{36}$/i;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/live-sessions/[id]/listen-heartbeat
// Called every ~10 s while the teacher is actively listening.
// Updates listening_heartbeat_at so the slave can detect stale listening state
// (>15 s without heartbeat = mic connection lost).
// No-ops silently if listening_active is already false.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    if (!UUID_REGEX.test(params.id)) {
      return apiError("sessionId invalide", 400);
    }

    const admin = createAdminClient();

    const { data: session } = await admin
      .from("live_sessions")
      .select("id, teacher_id, listening_active")
      .eq("id", params.id)
      .maybeSingle();

    if (!session) return apiError("Session introuvable", 404);
    if (session.teacher_id !== auth.user.id) return apiError("Accès refusé", 403);

    if (!session.listening_active) {
      return apiOk({ ok: true });
    }

    const { error } = await admin
      .from("live_sessions")
      .update({ listening_heartbeat_at: new Date().toISOString() })
      .eq("id", params.id);

    if (error) throw error;

    return apiOk({ ok: true });
  } catch (err) {
    return safeError(err, "live-sessions/[id]/listen-heartbeat:POST");
  }
}
