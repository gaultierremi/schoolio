import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSessionExpired } from "@/lib/live-session-utils";

export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z2-9]{6}$/;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// PATCH { current_page?, scroll_y?, zoom? } → sync full viewport state to projector
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!CODE_RE.test(code.toUpperCase())) {
    return NextResponse.json({ error: "Code session invalide" }, { status: 400 });
  }

  try {
    const body = await req.json() as { current_page?: number; scroll_y?: number; zoom?: number };

    if (
      (body.current_page !== undefined && (typeof body.current_page !== "number" || body.current_page < 1)) ||
      (body.scroll_y !== undefined && typeof body.scroll_y !== "number") ||
      (body.zoom !== undefined && (typeof body.zoom !== "number" || body.zoom <= 0 || body.zoom > 5))
    ) {
      return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
    }

    const { data: session } = await admin()
      .from("cockpit_sessions")
      .select("started_at, ended_at")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (session.ended_at) return NextResponse.json({ error: "Session terminée" }, { status: 410 });
    if (isSessionExpired(session.started_at)) {
      await admin()
        .from("cockpit_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("code", code.toUpperCase());
      return NextResponse.json({ error: "Session expirée (4h)" }, { status: 410 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.current_page !== undefined) patch.current_page = body.current_page;
    if (body.scroll_y !== undefined) patch.scroll_y = body.scroll_y;
    if (body.zoom !== undefined) patch.zoom = body.zoom;

    const { error } = await admin()
      .from("cockpit_sessions")
      .update(patch)
      .eq("code", code.toUpperCase());

    if (error) throw error;
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[cockpit/sessions/[code]/page-state:PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
