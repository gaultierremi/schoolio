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

// GET → public session snapshot for the display/projector page
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!CODE_RE.test(code.toUpperCase())) {
    return NextResponse.json({ error: "Code session invalide" }, { status: 400 });
  }

  try {
    const { data: session, error } = await admin()
      .from("cockpit_sessions")
      .select("id, code, pdf_key, current_page, total_pages, scroll_y, zoom, projected_question_id, show_answer, listening_active, started_at, ended_at")
      .eq("code", code.toUpperCase())
      .is("ended_at", null)
      .maybeSingle();

    if (error) throw error;
    if (!session) return NextResponse.json({ error: "Session introuvable ou terminée" }, { status: 404 });

    return NextResponse.json(session);
  } catch (err) {
    console.error("[cockpit/display/[code]:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
