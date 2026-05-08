import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type MembershipRow = {
  id: string;
  class_id: string;
  joined_at: string;
  classes: {
    name: string;
    level: string | null;
    subject: string | null;
    teacher_id: string;
  };
};

export async function GET() {
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

    const { data: memberships, error: membError } = await admin
      .from("class_memberships")
      .select(
        "id, class_id, joined_at, classes!inner(name, level, subject, teacher_id)"
      )
      .eq("student_user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: false });

    if (membError) throw membError;

    const rows = (memberships ?? []) as unknown as MembershipRow[];

    const teacherIds = [
      ...new Set(rows.map((r) => r.classes.teacher_id)),
    ];

    const teacherMap: Record<string, string> = {};
    if (teacherIds.length > 0) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, user_name")
        .in("id", teacherIds);
      for (const p of profiles ?? []) {
        teacherMap[p.id] = p.user_name;
      }
    }

    const result = rows.map((r) => ({
      classId: r.class_id,
      className: r.classes.name,
      level: r.classes.level,
      subject: r.classes.subject,
      teacherName: teacherMap[r.classes.teacher_id] ?? "Prof",
      joinedAt: r.joined_at,
    }));

    return NextResponse.json({ classes: result });
  } catch (err) {
    console.error("[student/my-classes:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
