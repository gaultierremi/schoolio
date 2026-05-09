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

// GET → list active members with their profile info
export async function GET(
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

    const { data: cls } = await admin
      .from("classes")
      .select("id")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (!cls) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const { data: memberships, error } = await admin
      .from("class_memberships")
      .select("student_user_id, user_profiles!inner(first_name, last_name)")
      .eq("class_id", params.id)
      .eq("status", "active");

    if (error) throw error;

    const members = (memberships ?? []).map((m) => {
      const profile = m.user_profiles as { first_name: string | null; last_name: string | null } | null;
      return {
        student_user_id: m.student_user_id,
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        display_name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Élève",
      };
    });

    return NextResponse.json(members);
  } catch (err) {
    console.error("[members:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PATCH { student_user_id, status: "active" | "removed" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    const { data: cls } = await admin
      .from("classes")
      .select("id")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .single();

    if (!cls) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const body = await req.json() as { student_user_id?: string; status?: string };

    if (!body.student_user_id || (body.status !== "active" && body.status !== "removed")) {
      return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
    }

    const { error } = await admin
      .from("class_memberships")
      .update({ status: body.status })
      .eq("class_id", params.id)
      .eq("student_user_id", body.student_user_id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[members:PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
