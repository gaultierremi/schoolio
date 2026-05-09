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

async function assertTeacherOwnsAssignment(
  admin: ReturnType<typeof createAdminClient>,
  assignmentId: string,
  teacherId: string
): Promise<boolean> {
  const { data } = await admin
    .from("assignments")
    .select("id")
    .eq("id", assignmentId)
    .eq("assigned_by", teacherId)
    .maybeSingle();
  return data !== null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; assignmentId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();
    const owns = await assertTeacherOwnsAssignment(admin, params.assignmentId, user.id);
    if (!owns) return NextResponse.json({ error: "Devoir introuvable" }, { status: 404 });

    const body = (await req.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (title.length < 2 || title.length > 120) {
        return NextResponse.json({ error: "Titre invalide" }, { status: 400 });
      }
      updates.title = title;
    }
    if ("description" in body) {
      updates.description =
        typeof body.description === "string" ? body.description.trim() || null : null;
    }
    if ("due_date" in body) {
      updates.due_date =
        typeof body.due_date === "string" && body.due_date ? body.due_date : null;
    }

    const { data: updated, error } = await admin
      .from("assignments")
      .update(updates)
      .eq("id", params.assignmentId)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ assignment: updated });
  } catch (err) {
    console.error("[assignment:PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; assignmentId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();
    const owns = await assertTeacherOwnsAssignment(admin, params.assignmentId, user.id);
    if (!owns) return NextResponse.json({ error: "Devoir introuvable" }, { status: 404 });

    const { error } = await admin
      .from("assignments")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", params.assignmentId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[assignment:DELETE]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
