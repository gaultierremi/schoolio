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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const admin = createAdminClient();

    const { data: assignment } = await admin
      .from("assignments")
      .select("id, class_id, resource_type")
      .eq("id", params.id)
      .is("archived_at", null)
      .maybeSingle();

    if (!assignment) return NextResponse.json({ error: "Devoir introuvable" }, { status: 404 });
    if (assignment.resource_type !== "pdf") {
      return NextResponse.json({ error: "Ce devoir n'est pas un PDF" }, { status: 400 });
    }

    // Verify student is active member
    const { data: membership } = await admin
      .from("class_memberships")
      .select("id")
      .eq("class_id", assignment.class_id)
      .eq("student_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    // Check if already completed (idempotent)
    const { data: existing } = await admin
      .from("assignment_completions")
      .select("status")
      .eq("assignment_id", params.id)
      .eq("student_user_id", user.id)
      .maybeSingle();

    if (existing?.status === "completed") {
      return NextResponse.json({ ok: true });
    }

    await admin.from("assignment_completions").upsert({
      assignment_id: params.id,
      student_user_id: user.id,
      status: "completed",
      completed_at: new Date().toISOString(),
    }, { onConflict: "assignment_id,student_user_id" });

    const { data: clsData } = await admin
      .from("classes")
      .select("teacher_id")
      .eq("id", assignment.class_id)
      .maybeSingle();
    if (clsData && typeof clsData.teacher_id === "string") {
      await logActivity({
        event_type: "student_read_pdf",
        actor_id: user.id,
        actor_type: "student",
        target_type: "assignment",
        target_id: params.id,
        teacher_id: clsData.teacher_id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[mark-read:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
