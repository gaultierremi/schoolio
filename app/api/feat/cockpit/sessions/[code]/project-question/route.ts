import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z2-9]{6}$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST { question_id } → project question on display; POST { show_answer: true } → reveal answer
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!CODE_RE.test(code.toUpperCase())) {
    return NextResponse.json({ error: "Code session invalide" }, { status: 400 });
  }

  try {
    const body = await req.json() as { question_id?: string; show_answer?: boolean };

    const { data: session } = await admin()
      .from("cockpit_sessions")
      .select("ended_at")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (session.ended_at) return NextResponse.json({ error: "Session terminée" }, { status: 410 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.question_id !== undefined) {
      if (!UUID_RE.test(body.question_id)) {
        return NextResponse.json({ error: "question_id invalide" }, { status: 400 });
      }
      patch.projected_question_id = body.question_id;
      patch.show_answer = false;
    } else if (body.show_answer === true) {
      patch.show_answer = true;
    } else {
      return NextResponse.json({ error: "question_id ou show_answer requis" }, { status: 400 });
    }

    const { error } = await admin()
      .from("cockpit_sessions")
      .update(patch)
      .eq("code", code.toUpperCase());

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cockpit/sessions/[code]/project-question:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
