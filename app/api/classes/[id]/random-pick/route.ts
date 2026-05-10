import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { getRandomPickCandidates, selectWeightedRandom } from "@/lib/random-pick";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
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

    const body = await req.json() as { live_session_id?: string; context?: string };

    const candidates = await getRandomPickCandidates(admin, params.id);
    if (!candidates.length) {
      return NextResponse.json({ error: "Aucun élève disponible" }, { status: 400 });
    }

    const selected = selectWeightedRandom(candidates);

    const { data: pick, error: insertError } = await admin
      .from("student_random_picks")
      .insert({
        class_id: params.id,
        student_user_id: selected.student_user_id,
        picked_by: user.id,
        live_session_id: body.live_session_id ?? null,
        context: body.context ?? null,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      pick_id: pick.id,
      student_user_id: selected.student_user_id,
      student_name: selected.student_name,
      pick_count_30d: selected.pick_count_30d,
      total_class_size: candidates.length,
      all_candidates: candidates,
    });
  } catch (err) {
    console.error("[random-pick:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
