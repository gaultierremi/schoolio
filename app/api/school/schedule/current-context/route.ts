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

type Slot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  week_pattern: string;
  class_id: string | null;
  subject_label: string | null;
  custom_color: string | null;
  notes: string | null;
  classes?: { id: string; name: string; subject: string | null } | null;
};

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function currentWeekLetter(
  date: Date,
  override: string
): "A" | "B" {
  if (override === "force_A") return "A";
  if (override === "force_B") return "B";
  return getISOWeek(date) % 2 === 1 ? "A" : "B";
}

function slotMatchesDay(slot: Slot, dayOfWeek: number, weekLetter: "A" | "B"): boolean {
  if (slot.day_of_week !== dayOfWeek) return false;
  if (slot.week_pattern === "all") return true;
  return slot.week_pattern === weekLetter;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function computeDayStatus(
  todaySlots: Slot[],
  nowMinutes: number
): string {
  if (todaySlots.length === 0) return "free";
  const allEnded = todaySlots.every((s) => timeToMinutes(s.end_time) <= nowMinutes);
  if (allEnded) return "done";
  const anyActive = todaySlots.some(
    (s) => timeToMinutes(s.start_time) <= nowMinutes && nowMinutes < timeToMinutes(s.end_time)
  );
  if (anyActive) return "in_class";
  const nextStart = Math.min(...todaySlots.filter((s) => timeToMinutes(s.start_time) > nowMinutes).map((s) => timeToMinutes(s.start_time)));
  if (isFinite(nextStart) && nextStart - nowMinutes <= 30) return "imminent";
  return "between";
}

function buildSuggestions(dayStatus: string, todaySlots: Slot[], nowMinutes: number): string[] {
  const suggestions: string[] = [];
  switch (dayStatus) {
    case "free":
      suggestions.push("Journée libre — idéal pour préparer tes cours ou générer des exercices.");
      break;
    case "done":
      suggestions.push("Cours du jour terminés — pense à valider les exercices en attente.");
      break;
    case "in_class": {
      const active = todaySlots.find(
        (s) => timeToMinutes(s.start_time) <= nowMinutes && nowMinutes < timeToMinutes(s.end_time)
      );
      if (active) {
        const remaining = timeToMinutes(active.end_time) - nowMinutes;
        suggestions.push(`Cours en cours — encore ${remaining} min.`);
      }
      break;
    }
    case "imminent": {
      const next = todaySlots
        .filter((s) => timeToMinutes(s.start_time) > nowMinutes)
        .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))[0];
      if (next) {
        const gap = timeToMinutes(next.start_time) - nowMinutes;
        suggestions.push(`Cours dans ${gap} min — prépare ta classe.`);
      }
      break;
    }
    case "between":
      suggestions.push("Entre deux cours — bon moment pour corriger ou répondre aux étudiants.");
      break;
  }
  return suggestions;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const tzOffset = parseInt(req.nextUrl.searchParams.get("tz_offset") ?? "0", 10);
    const safeOffset = Number.isFinite(tzOffset) && tzOffset >= -840 && tzOffset <= 840 ? tzOffset : 0;

    const nowUtcMs = Date.now();
    const localMs = nowUtcMs + safeOffset * 60 * 1000;
    const localDate = new Date(localMs);
    const nowMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
    const dayOfWeek = localDate.getUTCDay();

    const admin = createAdminClient();

    const [slotsResult, profileResult] = await Promise.all([
      admin
        .from("teacher_schedule_slots")
        .select("id, day_of_week, start_time, end_time, week_pattern, class_id, subject_label, custom_color, notes, classes(id, name, subject)")
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

    const slots = (slotsResult.data ?? []) as unknown as Slot[];
    const override = profileResult.data?.week_pattern_override ?? "auto";
    const current_week = currentWeekLetter(localDate, override);

    const todaySlots = slots.filter((s) => slotMatchesDay(s, dayOfWeek, current_week));

    const current_slot = todaySlots.find(
      (s) => timeToMinutes(s.start_time) <= nowMinutes && nowMinutes < timeToMinutes(s.end_time)
    ) ?? null;

    const upcoming = todaySlots
      .filter((s) => timeToMinutes(s.start_time) > nowMinutes)
      .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

    const next_slot = upcoming[0] ?? null;

    const past = todaySlots
      .filter((s) => timeToMinutes(s.end_time) <= nowMinutes)
      .sort((a, b) => timeToMinutes(b.end_time) - timeToMinutes(a.end_time));

    const previous_slot = past[0] ?? null;

    const gap_until_next_minutes = next_slot
      ? timeToMinutes(next_slot.start_time) - nowMinutes
      : null;

    const day_status = computeDayStatus(todaySlots, nowMinutes);
    const suggestions = buildSuggestions(day_status, todaySlots, nowMinutes);

    return NextResponse.json({
      now_iso: new Date(localMs).toISOString(),
      now_time: minutesToHHMM(nowMinutes),
      current_week,
      current_slot,
      next_slot,
      previous_slot,
      gap_until_next_minutes,
      day_status,
      suggestions,
    });
  } catch (err) {
    console.error("[schedule/current-context:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
