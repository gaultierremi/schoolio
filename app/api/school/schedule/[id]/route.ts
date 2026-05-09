import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity/log";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type SlotRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  week_pattern: string;
  class_id: string | null;
  subject_label: string | null;
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

// ── PATCH : update slot ───────────────────────────────────────────────────────

type PatchBody = {
  day_of_week?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  week_pattern?: unknown;
  class_id?: unknown;
  subject_label?: unknown;
  custom_color?: unknown;
  notes?: unknown;
};

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

    const { data: existing, error: fetchErr } = await admin
      .from("teacher_schedule_slots")
      .select("*")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 });

    const body = (await req.json()) as PatchBody;
    const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

    const updates: Record<string, unknown> = {};

    if (body.day_of_week !== undefined) {
      if (typeof body.day_of_week !== "number" || !Number.isInteger(body.day_of_week) || body.day_of_week < 0 || body.day_of_week > 6) {
        return NextResponse.json({ error: "day_of_week invalide (0–6)" }, { status: 400 });
      }
      updates.day_of_week = body.day_of_week;
    }
    if (body.start_time !== undefined) {
      if (typeof body.start_time !== "string" || !TIME_RE.test(body.start_time)) {
        return NextResponse.json({ error: "start_time invalide (HH:MM)" }, { status: 400 });
      }
      updates.start_time = body.start_time;
    }
    if (body.end_time !== undefined) {
      if (typeof body.end_time !== "string" || !TIME_RE.test(body.end_time)) {
        return NextResponse.json({ error: "end_time invalide (HH:MM)" }, { status: 400 });
      }
      updates.end_time = body.end_time;
    }
    if (body.week_pattern !== undefined) {
      if (body.week_pattern !== "all" && body.week_pattern !== "A" && body.week_pattern !== "B") {
        return NextResponse.json({ error: "week_pattern invalide" }, { status: 400 });
      }
      updates.week_pattern = body.week_pattern;
    }
    if (body.class_id !== undefined) {
      updates.class_id = typeof body.class_id === "string" && body.class_id ? body.class_id : null;
    }
    if (body.subject_label !== undefined) {
      updates.subject_label = typeof body.subject_label === "string" && body.subject_label.trim()
        ? body.subject_label.trim().slice(0, 80) : null;
    }
    if (body.custom_color !== undefined) {
      updates.custom_color = typeof body.custom_color === "string" && body.custom_color ? body.custom_color : null;
    }
    if (body.notes !== undefined) {
      updates.notes = typeof body.notes === "string" && body.notes.trim()
        ? body.notes.trim().slice(0, 500) : null;
    }

    const merged = { ...existing, ...updates } as SlotRow;

    if (merged.start_time >= merged.end_time) {
      return NextResponse.json({ error: "L'heure de fin doit être après l'heure de début" }, { status: 400 });
    }

    if (!merged.class_id && !merged.subject_label) {
      return NextResponse.json({ error: "Classe ou intitulé requis" }, { status: 400 });
    }

    // Overlap check excluding self
    const { data: others } = await admin
      .from("teacher_schedule_slots")
      .select("id, day_of_week, start_time, end_time, week_pattern")
      .eq("teacher_id", user.id)
      .eq("day_of_week", merged.day_of_week)
      .neq("id", params.id);

    const conflict = (others ?? []).find((s) => timesOverlap(merged, s as SlotRow));
    if (conflict) {
      return NextResponse.json({ error: "Ce créneau chevauche un créneau existant" }, { status: 409 });
    }

    const { data: updated, error: updateErr } = await admin
      .from("teacher_schedule_slots")
      .update(updates)
      .eq("id", params.id)
      .select("*")
      .single();

    if (updateErr) throw updateErr;

    await logActivity({
      event_type: "teacher_updated_schedule_slot",
      actor_id: user.id,
      actor_type: "teacher",
      target_type: "schedule_slot",
      target_id: params.id,
      teacher_id: user.id,
    });

    return NextResponse.json({ slot: updated });
  } catch (err) {
    console.error("[schedule/[id]:PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ── DELETE : remove slot ──────────────────────────────────────────────────────

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

    const { data: existing } = await admin
      .from("teacher_schedule_slots")
      .select("id")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 });

    const { error: deleteErr } = await admin
      .from("teacher_schedule_slots")
      .delete()
      .eq("id", params.id);

    if (deleteErr) throw deleteErr;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[schedule/[id]:DELETE]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
