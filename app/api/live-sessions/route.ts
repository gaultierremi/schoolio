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

// POST { course_id, class_id? } → creates a live session
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await req.json() as { course_id?: string; class_id?: string };
    if (!body.course_id) return NextResponse.json({ error: "course_id requis" }, { status: 400 });

    const admin = createAdminClient();

    const { data: course } = await admin
      .from("courses")
      .select("id")
      .eq("id", body.course_id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (!course) return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });

    // Generate a unique code with retry on collision
    let session = null;
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      const code = generateSessionCode();
      const { data, error } = await admin
        .from("live_sessions")
        .insert({
          code,
          teacher_id: user.id,
          course_id: body.course_id,
          class_id: body.class_id ?? null,
        })
        .select()
        .single();

      if (!error) {
        session = data;
        break;
      }
      // 23505 = unique_violation → code collision, retry
      if ((error as { code?: string }).code !== "23505") throw error;
    }

    if (!session) {
      return NextResponse.json({ error: "Impossible de générer un code unique" }, { status: 500 });
    }

    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    console.error("[live-sessions:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
