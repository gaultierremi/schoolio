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

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; pickId: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const admin = createAdminClient();

    const { data: cls } = await admin
      .from("classes")
      .select("id")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (!cls) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const { error } = await admin
      .from("student_random_picks")
      .update({ was_cancelled: true })
      .eq("id", params.pickId)
      .eq("class_id", params.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[random-pick:cancel:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
