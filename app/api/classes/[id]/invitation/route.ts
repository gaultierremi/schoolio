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

// PATCH /api/classes/[id]/invitation — update invitation_enabled / invitation_expires_at
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    // Verify ownership
    const { data: existing } = await admin
      .from("classes")
      .select("id")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const body = (await req.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.invitation_enabled === "boolean") {
      updates.invitation_enabled = body.invitation_enabled;
    }
    if ("invitation_expires_at" in body) {
      updates.invitation_expires_at = body.invitation_expires_at ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Aucune mise à jour" }, { status: 400 });
    }

    const { data: updated, error } = await admin
      .from("classes")
      .update(updates)
      .eq("id", params.id)
      .select("id, invitation_code, invitation_enabled, invitation_expires_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ class: updated });
  } catch (err) {
    console.error("[invitation:PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
