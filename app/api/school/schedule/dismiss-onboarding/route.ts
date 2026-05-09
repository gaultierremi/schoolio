import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity/log";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    const { error } = await admin
      .from("user_profiles")
      .update({ schedule_onboarding_dismissed: true })
      .eq("id", user.id);

    if (error) throw error;

    await logActivity({
      event_type: "teacher_dismissed_onboarding",
      actor_id: user.id,
      actor_type: "teacher",
      target_type: "teacher",
      target_id: user.id,
      teacher_id: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[schedule/dismiss-onboarding:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
