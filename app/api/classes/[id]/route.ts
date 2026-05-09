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

async function assertTeacherOwns(
  admin: ReturnType<typeof createAdminClient>,
  classId: string,
  teacherId: string
): Promise<boolean> {
  const { data } = await admin
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("teacher_id", teacherId)
    .single();
  return data !== null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    const [classRes, membersRes] = await Promise.all([
      admin
        .from("classes")
        .select("id, name, level, subject, auth_mode, invite_code, invite_link_token, archived_at, created_at, updated_at")
        .eq("id", params.id)
        .eq("teacher_id", user.id)
        .single(),
      admin
        .from("class_memberships")
        .select("id, student_user_id, joined_at, status")
        .eq("class_id", params.id),
    ]);

    if (classRes.error) {
      if (classRes.error.code === "PGRST116") {
        return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
      }
      throw classRes.error;
    }

    const rawMembers = membersRes.data ?? [];
    const studentIds = rawMembers.map((m) => m.student_user_id);

    type ProfileRow = { id: string; first_name: string | null; last_name: string | null; pseudo: string | null; auth_mode: string | null; user_name: string | null };
    const profileMap = new Map<string, ProfileRow>();
    if (studentIds.length > 0) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, pseudo, auth_mode, user_name")
        .in("id", studentIds);
      for (const p of (profiles ?? []) as ProfileRow[]) profileMap.set(p.id, p);
    }

    function buildDisplayName(p: ProfileRow | undefined): string {
      if (!p) return "—";
      if (p.auth_mode === "light") {
        const parts = [p.first_name, p.last_name].filter(Boolean).join(" ");
        return parts ? `${parts} (pseudo: ${p.pseudo ?? ""})` : (p.pseudo ?? "—");
      }
      if (p.first_name) return [p.first_name, p.last_name].filter(Boolean).join(" ");
      return p.user_name ?? "—";
    }

    const members = rawMembers
      .map((m) => ({
        ...m,
        display_name: buildDisplayName(profileMap.get(m.student_user_id)),
        _sortLast: (profileMap.get(m.student_user_id)?.last_name ?? "").toLowerCase(),
        _sortFirst: (profileMap.get(m.student_user_id)?.first_name ?? profileMap.get(m.student_user_id)?.user_name ?? "").toLowerCase(),
      }))
      .sort((a, b) => {
        const lc = a._sortLast.localeCompare(b._sortLast, "fr", { sensitivity: "base" });
        if (lc !== 0) return lc;
        return a._sortFirst.localeCompare(b._sortFirst, "fr", { sensitivity: "base" });
      })
      .map(({ _sortLast: _l, _sortFirst: _f, ...rest }) => rest);

    return NextResponse.json({ class: classRes.data, members });
  } catch (err) {
    console.error("[class:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();
    const owns = await assertTeacherOwns(admin, params.id, user.id);
    if (!owns) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const body = await req.json() as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (name.length < 2 || name.length > 80) {
        return NextResponse.json({ error: "Nom invalide" }, { status: 400 });
      }
      updates.name = name;
    }
    if ("level" in body) updates.level = body.level ?? null;
    if ("subject" in body) updates.subject = body.subject ?? null;
    if (body.auth_mode === "full" || body.auth_mode === "light") {
      updates.auth_mode = body.auth_mode;
    }
    if ("archived" in body) {
      updates.archived_at = body.archived ? new Date().toISOString() : null;
    }

    const { data: updated, error } = await admin
      .from("classes")
      .update(updates)
      .eq("id", params.id)
      .select("id, name, level, subject, auth_mode, invite_code, invite_link_token, archived_at, created_at, updated_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ class: updated });
  } catch (err) {
    console.error("[class:PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();
    const owns = await assertTeacherOwns(admin, params.id, user.id);
    if (!owns) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const { error } = await admin.from("classes").delete().eq("id", params.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[class:DELETE]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
