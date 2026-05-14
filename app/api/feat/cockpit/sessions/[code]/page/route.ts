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

// PATCH { page } → update current_page; also serves as 30s heartbeat via updated_at
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!CODE_RE.test(code.toUpperCase())) {
    return NextResponse.json({ error: "Code session invalide" }, { status: 400 });
  }

  try {
    const body = await req.json() as { page?: number };
    if (typeof body.page !== "number" || body.page < 1) {
      return NextResponse.json({ error: "page invalide" }, { status: 400 });
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

    const { error } = await admin()
      .from("cockpit_sessions")
      .update({ current_page: body.page, updated_at: new Date().toISOString() })
      .eq("code", code.toUpperCase());

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cockpit/sessions/[code]/page:PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
