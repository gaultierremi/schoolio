import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z2-9]{6}$/;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST → mark session as ended
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!CODE_RE.test(code.toUpperCase())) {
    return NextResponse.json({ error: "Code session invalide" }, { status: 400 });
  }

  try {
    const { data: session } = await admin()
      .from("cockpit_sessions")
      .select("id")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    const { error } = await admin()
      .from("cockpit_sessions")
      .update({ ended_at: new Date().toISOString(), is_active: false })
      .eq("code", code.toUpperCase());

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cockpit/sessions/[code]/end:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
