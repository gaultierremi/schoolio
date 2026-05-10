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

// POST → clear projected question, return slave to PDF view
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: "sessionId invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: session } = await admin
      .from("live_sessions")
      .select("id, teacher_id, ended_at")
      .eq("id", params.id)
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (session.teacher_id !== user.id) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (session.ended_at) return NextResponse.json({ error: "Session terminée" }, { status: 410 });

    const { error } = await admin
      .from("live_sessions")
      .update({
        projected_question_id: null,
        show_answer: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[live-sessions/[id]/back-to-pdf:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
