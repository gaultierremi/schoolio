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

// POST /api/join — auth required
// Body: { code: string }
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = (await req.json()) as { code?: string };
    const code = body.code?.trim().toUpperCase();

    if (!code || code.length !== 8) {
      return NextResponse.json({ error: "Code invalide" }, { status: 400 });
    }

    const admin = createAdminClient();
    const email = user.email?.toLowerCase() ?? "";

    // Validate class
    const { data: cls } = await admin
      .from("classes")
      .select("id, name, teacher_id, invitation_enabled, invitation_expires_at, archived_at")
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

    // Check if already a member of this class
    const { data: existingMember } = await admin
      .from("class_memberships")
      .select("id, status")
      .eq("class_id", cls.id)
      .eq("student_user_id", user.id)
      .maybeSingle();

    if (existingMember?.status === "active") {
      return NextResponse.json({ ok: true, already_member: true, class_name: cls.name });
    }

    // Ensure user is set as student (Google OAuth users may have no role yet).
    // Role goes in app_metadata so it cannot be tampered with from the
    // browser. We also write it to user_metadata for legacy code that still
    // reads from there (transitional; will be removed in a follow-up).
    const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
    if (!appMeta.role && !userMeta.role) {
      await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { role: "student" },
        user_metadata: { ...userMeta, role: "student" },
      });
    } else if (!appMeta.role) {
      // Role is in user_metadata but not app_metadata: backfill app_metadata.
      await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { role: userMeta.role },
      });
    }
    const meta = userMeta;

    // Ensure user_profile exists
    const { data: profile } = await admin
      .from("user_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      const displayName =
        (meta.full_name as string | undefined) ??
        (meta.name as string | undefined) ??
        email.split("@")[0];
      await admin.from("user_profiles").upsert({
        id: user.id,
        user_name: displayName,
        first_name: (meta.given_name as string | undefined) ?? null,
        last_name: (meta.family_name as string | undefined) ?? null,
        role: "student",
        auth_mode: "full",
        avatar_color: "#a855f7",
        unlocked_skins: ["default"],
        active_skin: "default",
        streak: 0,
        total_games: 0,
        total_score: 0,
      });
    }

    // Add or reactivate class membership. We DO NOT auto-whitelist the user
    // for the beta. Granting beta access from a guessable invitation code
    // defeated the entire whitelist gate (any auth user with a leaked or
    // brute-forced code unlocked permanent access). Beta status now requires
    // explicit admin approval via /admin/beta-whitelist.
    if (existingMember) {
      await admin
        .from("class_memberships")
        .update({ status: "active" })
        .eq("id", existingMember.id);
    } else {
      await admin.from("class_memberships").insert({
        class_id: cls.id,
        student_user_id: user.id,
        status: "active",
      });
    }

    // Tell the client whether the user can actually use the app (whitelisted)
    // or will be parked on /beta-pending after redirect. The membership is
    // recorded either way so the teacher sees them in the class roster.
    const { data: whitelisted } = await admin
      .from("beta_whitelist")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      class_name: cls.name,
      whitelisted: !!whitelisted,
    });
  } catch (err) {
    console.error("[api/join:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
