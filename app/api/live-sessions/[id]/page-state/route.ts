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

// PATCH { current_page?, scroll_y?, zoom? } → sync full viewport state
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const body = await req.json() as {
      current_page?: number;
      scroll_y?: number;
      zoom?: number;
    };

    if (
      (body.current_page !== undefined && (typeof body.current_page !== "number" || body.current_page < 1)) ||
      (body.scroll_y !== undefined && typeof body.scroll_y !== "number") ||
      (body.zoom !== undefined && (typeof body.zoom !== "number" || body.zoom <= 0))
    ) {
      return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
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

    if (isSessionExpired(session.started_at)) {
      await admin
        .from("live_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", params.id);
      return NextResponse.json({ error: "Session expirée (4h)" }, { status: 410 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.current_page !== undefined) patch.current_page = body.current_page;
    if (body.scroll_y !== undefined) patch.scroll_y = body.scroll_y;
    if (body.zoom !== undefined) patch.zoom = body.zoom;

    const { error } = await admin
      .from("live_sessions")
      .update(patch)
      .eq("id", params.id);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[live-sessions/[id]/page-state:PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
