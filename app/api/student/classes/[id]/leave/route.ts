import { NextRequest, NextResponse } from "next/server";
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

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { error } = await admin
      .from("class_memberships")
      .update({ status: "removed" })
      .eq("class_id", params.id)
      .eq("student_user_id", user.id)
      .eq("status", "active");

    if (error) throw error;

    const { data: clsData } = await admin
      .from("classes")
      .select("teacher_id")
      .eq("id", params.id)
      .maybeSingle();
    if (clsData && typeof clsData.teacher_id === "string") {
      await logActivity({
        event_type: "student_left_class",
        actor_id: user.id,
        actor_type: "student",
        target_type: "class",
        target_id: params.id,
        teacher_id: clsData.teacher_id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[student/leave:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
