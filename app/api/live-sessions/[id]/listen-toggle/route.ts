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

// POST /api/live-sessions/[id]/listen-toggle
// Body: { active: boolean }
// Activates or deactivates "Schoolio écoute" for a live session.
// Propagated via Realtime to slave screens (badge visibility).
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    if (!UUID_REGEX.test(params.id)) {
      return apiError("sessionId invalide", 400);
    }

    const body = (await req.json()) as { active?: unknown };
    if (typeof body.active !== "boolean") {
      return apiError("Le champ 'active' (boolean) est requis", 400);
    }
    const active = body.active;

    const admin = createAdminClient();

    const { data: session } = await admin
      .from("live_sessions")
      .select("id, teacher_id, ended_at")
      .eq("id", params.id)
      .maybeSingle();

    if (!session) return apiError("Session introuvable", 404);
    if (session.teacher_id !== auth.user.id) return apiError("Accès refusé", 403);
    if (session.ended_at) return apiError("Session terminée", 410);

    const now = new Date().toISOString();
    const { error } = await admin
      .from("live_sessions")
      .update({
        listening_active: active,
        listening_heartbeat_at: active ? now : null,
      })
      .eq("id", params.id);

    if (error) throw error;

    return apiOk({ listening_active: active });
  } catch (err) {
    return safeError(err, "live-sessions/[id]/listen-toggle:POST");
  }
}
