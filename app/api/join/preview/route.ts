import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/join/preview?code=XXXX — public, no auth required
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim().toUpperCase();

  if (!code || code.length !== 8) {
    return NextResponse.json({ error: "Code invalide" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: cls } = await admin
    .from("classes")
    .select("id, name, level, subject, teacher_id, invitation_enabled, invitation_expires_at, archived_at")
    .eq("invitation_code", code)
    .maybeSingle();

  if (!cls || cls.archived_at) {
    return NextResponse.json({ error: "Code invalide ou classe introuvable" }, { status: 404 });
  }
  if (!cls.invitation_enabled) {
    return NextResponse.json({ error: "Les inscriptions sont fermées pour cette classe" }, { status: 403 });
  }
  if (cls.invitation_expires_at && new Date(cls.invitation_expires_at) < new Date()) {
    return NextResponse.json({ error: "Ce code d'invitation a expiré" }, { status: 410 });
  }

  // Teacher name
  const { data: profile } = await admin
    .from("user_profiles")
    .select("first_name, last_name, user_name")
    .eq("id", cls.teacher_id)
    .maybeSingle();

  const teacher_name = profile
    ? profile.first_name && profile.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : (profile.first_name ?? profile.user_name ?? "Professeur")
    : "Professeur";

  // Student count
  const { count } = await admin
    .from("class_memberships")
    .select("id", { count: "exact", head: true })
    .eq("class_id", cls.id)
    .eq("status", "active");

  return NextResponse.json({
    class_name: cls.name,
    teacher_name,
    level: cls.level,
    student_count: count ?? 0,
  });
}
