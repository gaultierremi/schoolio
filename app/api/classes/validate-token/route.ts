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
    const body = await req.json() as { token?: unknown };
    const token =
      typeof body.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json({ error: "Token manquant" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: cls, error } = await admin
      .from("classes")
      .select("id, name, auth_mode, archived_at, teacher_id")
      .eq("invite_link_token", token)
      .maybeSingle();

    if (error) throw error;
    if (!cls) {
      return NextResponse.json(
        { error: "Lien invalide ou expiré" },
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
      authMode: cls.auth_mode as "full" | "light",
      teacherName: teacherProfile?.user_name ?? undefined,
    });
  } catch (err) {
    console.error("[validate-token:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
