import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { code?: unknown };
    const code =
      typeof body.code === "string" ? body.code.trim().toUpperCase() : "";

    if (!code || code.length !== 6) {
      return NextResponse.json({ error: "Code invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: cls, error } = await admin
      .from("classes")
      .select("id, name, archived_at, invite_link_token, teacher_id")
      .eq("invite_code", code)
      .maybeSingle();

    if (error) throw error;
    if (!cls) {
      return NextResponse.json(
        { error: "Code invalide ou classe introuvable" },
        { status: 404 }
      );
    }
    if (cls.archived_at) {
      return NextResponse.json(
        { error: "Cette classe est archivée" },
        { status: 410 }
      );
    }

    const { data: teacherProfile } = await admin
      .from("user_profiles")
      .select("user_name")
      .eq("id", cls.teacher_id)
      .maybeSingle();

    return NextResponse.json({
      classId: cls.id,
      className: cls.name,
      inviteLinkToken: cls.invite_link_token,
      teacherName: teacherProfile?.user_name ?? undefined,
    });
  } catch (err) {
    console.error("[validate-code:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
