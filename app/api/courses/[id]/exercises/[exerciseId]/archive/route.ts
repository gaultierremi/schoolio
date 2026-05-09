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

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string; exerciseId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) {
      return NextResponse.json({ error: "Accès réservé aux professeurs" }, { status: 403 });
    }

    const admin = createAdminClient();

    const { data: exercise, error: fetchErr } = await admin
      .from("exercises")
      .select("id")
      .eq("id", params.exerciseId)
      .eq("course_id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!exercise) {
      return NextResponse.json({ error: "Exercice introuvable" }, { status: 404 });
    }

    const { data: updated, error: updateErr } = await admin
      .from("exercises")
      .update({ status: "archived" })
      .eq("id", params.exerciseId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json({ exercise: updated });
  } catch (err) {
    console.error("[exercises/archive:PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
