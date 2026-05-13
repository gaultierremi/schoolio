import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { requireSchoolMembership } from "@/lib/tenant";
import { logActivity } from "@/lib/activity/log";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type SlotRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  week_pattern: string;
};

function timesOverlap(a: SlotRow, b: SlotRow): boolean {
  if (a.day_of_week !== b.day_of_week) return false;
  const patternsConflict =
    a.week_pattern === "all" ||
    b.week_pattern === "all" ||
    a.week_pattern === b.week_pattern;
  if (!patternsConflict) return false;
  return a.start_time < b.end_time && a.end_time > b.start_time;
}

// ── GET : list slots ──────────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    const [slotsResult, profileResult] = await Promise.all([
      admin
        .from("teacher_schedule_slots")
        .select("id, day_of_week, start_time, end_time, week_pattern, class_id, subject_label, custom_color, notes, created_at, classes(id, name, subject)")
        .eq("teacher_id", user.id)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true }),
      admin
        .from("user_profiles")
        .select("week_pattern_override")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    if (slotsResult.error) throw slotsResult.error;

    return NextResponse.json({
      slots: slotsResult.data ?? [],
      week_pattern_override: profileResult.data?.week_pattern_override ?? "auto",
    });
  } catch (err) {
    console.error("[schedule:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ── POST : create slot ────────────────────────────────────────────────────────

type CreateBody = {
  day_of_week?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  week_pattern?: unknown;
  class_id?: unknown;
  subject_label?: unknown;
  custom_color?: unknown;
  notes?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    // teacher_schedule_slots.school_id devenu NOT NULL via migration multi-tenant
    // (20260513140100_add_school_id_to_tables + 20260513160000_seed_foundertestground).
    // L'insert plantait avec contrainte NOT NULL — bug corrigé ici.
    const schoolId = await requireSchoolMembership(supabase);

    const body = (await req.json()) as CreateBody;

    const day_of_week = typeof body.day_of_week === "number" && Number.isInteger(body.day_of_week) && body.day_of_week >= 0 && body.day_of_week <= 6
      ? body.day_of_week : null;
    if (day_of_week === null) return NextResponse.json({ error: "day_of_week invalide (0–6)" }, { status: 400 });

    const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
    const start_time = typeof body.start_time === "string" && TIME_RE.test(body.start_time) ? body.start_time : null;
    const end_time = typeof body.end_time === "string" && TIME_RE.test(body.end_time) ? body.end_time : null;
    if (!start_time || !end_time) return NextResponse.json({ error: "Horaires invalides (HH:MM)" }, { status: 400 });
    if (start_time >= end_time) return NextResponse.json({ error: "L'heure de fin doit être après l'heure de début" }, { status: 400 });

    const week_pattern = body.week_pattern === "all" || body.week_pattern === "A" || body.week_pattern === "B"
      ? body.week_pattern : "all";

    const class_id = typeof body.class_id === "string" && body.class_id ? body.class_id : null;
    const subject_label = typeof body.subject_label === "string" && body.subject_label.trim()
      ? body.subject_label.trim().slice(0, 80) : null;

    if (!class_id && !subject_label) {
      return NextResponse.json({ error: "Classe ou intitulé requis" }, { status: 400 });
    }

    const custom_color = typeof body.custom_color === "string" && body.custom_color ? body.custom_color : null;
    const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null;

    const admin = createAdminClient();

    // Overlap check
    const { data: existing } = await admin
      .from("teacher_schedule_slots")
      .select("id, day_of_week, start_time, end_time, week_pattern")
      .eq("teacher_id", user.id)
      .eq("day_of_week", day_of_week);

    const candidate = { day_of_week, start_time, end_time, week_pattern };
    const conflict = (existing ?? []).find((s) => timesOverlap(candidate, s as SlotRow));
    if (conflict) {
      return NextResponse.json({ error: "Ce créneau chevauche un créneau existant" }, { status: 409 });
    }

    const { data: slot, error: insertError } = await admin
      .from("teacher_schedule_slots")
      .insert({ teacher_id: user.id, school_id: schoolId, day_of_week, start_time, end_time, week_pattern, class_id, subject_label, custom_color, notes })
      .select("*")
      .single();

    if (insertError) throw insertError;

    await logActivity({
      event_type: "teacher_added_schedule_slot",
      actor_id: user.id,
      actor_type: "teacher",
      target_type: "schedule_slot",
      target_id: (slot as { id: string }).id,
      teacher_id: user.id,
      context: { day_of_week, start_time, end_time },
    });

    return NextResponse.json({ slot }, { status: 201 });
  } catch (err) {
    console.error("[schedule:POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
