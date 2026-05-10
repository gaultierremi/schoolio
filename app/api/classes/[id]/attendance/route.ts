import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type AttendanceRecord = {
  student_user_id: string;
  status: "present" | "absent" | "late";
  notes?: string;
};

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST { date, period?, records: [{ student_user_id, status, notes? }] }
export async function POST(
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

    const { data: cls } = await admin
      .from("classes")
      .select("id")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (!cls) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    const body = await req.json() as {
      date?: string;
      period?: number;
      records?: AttendanceRecord[];
    };

    if (!body.date || !Array.isArray(body.records) || body.records.length === 0) {
      return NextResponse.json({ error: "date et records requis" }, { status: 400 });
    }

    const rows = body.records.map((r) => ({
      class_id: params.id,
      student_user_id: r.student_user_id,
      date: body.date,
      period: body.period ?? 0,
      status: r.status,
      notes: r.notes ?? null,
      recorded_by: user.id,
    }));

    const { error } = await admin
      .from("class_attendance_records")
      .upsert(rows, { onConflict: "class_id,student_user_id,date,period" });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[classes/[id]/attendance:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
