import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { isSessionExpired } from "@/lib/live-session-utils";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// PATCH { page } → update current_page; also serves as heartbeat via updated_at
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const body = await req.json() as { page?: number };
    if (typeof body.page !== "number" || body.page < 1) {
      return NextResponse.json({ error: "page invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: session } = await admin
      .from("live_sessions")
      .select("id, teacher_id, started_at, ended_at")
      .eq("id", params.id)
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (session.teacher_id !== user.id) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (session.ended_at) return NextResponse.json({ error: "Session terminée" }, { status: 410 });

    // 4-hour hard timeout
    if (isSessionExpired(session.started_at)) {
      await admin
        .from("live_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", params.id);
      return NextResponse.json({ error: "Session expirée (4h)" }, { status: 410 });
    }

    const { error } = await admin
      .from("live_sessions")
      .update({ current_page: body.page, updated_at: new Date().toISOString() })
      .eq("id", params.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[live-sessions/[id]/page:PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
