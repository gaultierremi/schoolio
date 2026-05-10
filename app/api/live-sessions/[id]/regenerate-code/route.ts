import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { generateSessionCode } from "@/lib/live-session-utils";

export const dynamic = "force-dynamic";

const MAX_CODE_RETRIES = 5;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST → generate a new pairing code for an active session
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const admin = createAdminClient();

    const { data: session } = await admin
      .from("live_sessions")
      .select("id, teacher_id, ended_at")
      .eq("id", params.id)
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (session.teacher_id !== user.id) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (session.ended_at) return NextResponse.json({ error: "Session terminée" }, { status: 410 });

    let newCode: string | null = null;
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      const code = generateSessionCode();
      const { error } = await admin
        .from("live_sessions")
        .update({ code })
        .eq("id", params.id);

      if (!error) {
        newCode = code;
        break;
      }
      if ((error as { code?: string }).code !== "23505") throw error;
    }

    if (!newCode) {
      return NextResponse.json({ error: "Impossible de générer un code unique" }, { status: 500 });
    }

    return NextResponse.json({ code: newCode });
  } catch (err) {
    console.error("[live-sessions/[id]/regenerate-code:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
