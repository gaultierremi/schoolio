import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f-]{36}$/i;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST { question_id } → project question on slave; POST {} → reveal answer (show_answer=true)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: "sessionId invalide" }, { status: 400 });
    }

    const body = await req.json() as { question_id?: string; show_answer?: boolean };

    const admin = createAdminClient();

    const { data: session } = await admin
      .from("live_sessions")
      .select("id, teacher_id, ended_at")
      .eq("id", params.id)
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (session.teacher_id !== user.id) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (session.ended_at) return NextResponse.json({ error: "Session terminée" }, { status: 410 });

    // If question_id provided: project it (and reset show_answer)
    // If show_answer=true: reveal the answer for the currently projected question
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.question_id !== undefined) {
      if (!UUID_REGEX.test(body.question_id)) {
        return NextResponse.json({ error: "question_id invalide" }, { status: 400 });
      }
      patch.projected_question_id = body.question_id;
      patch.show_answer = false;
    } else if (body.show_answer === true) {
      patch.show_answer = true;
    } else {
      return NextResponse.json({ error: "question_id ou show_answer requis" }, { status: 400 });
    }

    const { error } = await admin
      .from("live_sessions")
      .update(patch)
      .eq("id", params.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[live-sessions/[id]/project-question:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
