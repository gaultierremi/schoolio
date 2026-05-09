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

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = (await req.json()) as { override?: unknown };
    if (body.override !== "auto" && body.override !== "force_A" && body.override !== "force_B") {
      return NextResponse.json({ error: "override invalide (auto | force_A | force_B)" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("user_profiles")
      .update({ week_pattern_override: body.override })
      .eq("id", user.id);

    if (error) throw error;

    return NextResponse.json({ week_pattern_override: body.override });
  } catch (err) {
    console.error("[schedule/week-pattern-override:PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
