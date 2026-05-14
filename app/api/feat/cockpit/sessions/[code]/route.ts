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

// GET → full session snapshot (used by master page on load)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!CODE_RE.test(code.toUpperCase())) {
    return NextResponse.json({ error: "Code session invalide" }, { status: 400 });
  }

  try {
    const { data, error } = await admin()
      .from("cockpit_sessions")
      .select("*")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[cockpit/sessions/[code]:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
