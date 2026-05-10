import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function generateCode(): string {
  return Math.random().toString(36).substring(2, 6).toUpperCase() +
         Math.random().toString(36).substring(2, 6).toUpperCase();
}

// POST /api/classes/[id]/invitation/regenerate
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("classes")
      .select("id")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    // Try to find a unique code (collision is extremely unlikely)
    let invitation_code = "";
    for (let i = 0; i < 5; i++) {
      const candidate = generateCode().substring(0, 8);
      const { count } = await admin
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("invitation_code", candidate)
        .neq("id", params.id);
      if ((count ?? 0) === 0) { invitation_code = candidate; break; }
    }
    if (!invitation_code) {
      return NextResponse.json({ error: "Impossible de générer un code unique" }, { status: 500 });
    }

    const { data, error } = await admin
      .from("classes")
      .update({ invitation_code })
      .eq("id", params.id)
      .select("invitation_code")
      .single();

    if (error) throw error;
    return NextResponse.json({ invitation_code: data.invitation_code });
  } catch (err) {
    console.error("[invitation/regenerate:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
