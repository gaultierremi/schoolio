import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("classes")
      .select("id")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .single();

    if (!existing) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const { data, error } = await admin
      .from("classes")
      .update({ invite_link_token: crypto.randomUUID() })
      .eq("id", params.id)
      .select("invite_link_token")
      .single();

    if (error) throw error;

    return NextResponse.json({ invite_link_token: data.invite_link_token });
  } catch (err) {
    console.error("[regenerate-link:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
