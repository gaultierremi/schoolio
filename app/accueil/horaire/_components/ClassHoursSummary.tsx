"use client";

import { Clock } from "lucide-react";

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

type Props = {
  slots: Slot[];
};

const DAY_SHORT: Record<number, string> = {
  0: "Dim",
  1: "Lun",
  2: "Mar",
  3: "Mer",
  4: "Jeu",
  5: "Ven",
  6: "Sam",
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

/** Format "HH:MM" → "8h30" style compact */
function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

type ClassSummary = {
  classId: string;
  name: string;
  subject: string | null;
  totalMinutes: number;
  slots: { dow: number; start: string; end: string }[];
};

function buildSummaries(slots: Slot[]): ClassSummary[] {
  const map = new Map<string, ClassSummary>();

  for (const slot of slots) {
    if (!slot.class_id) continue;

    const existing = map.get(slot.class_id);
    const durationMin = timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time);
    // Alternating weeks (A or B) count as half a week on average
    const weeklyMin = slot.week_pattern === "A" || slot.week_pattern === "B"
      ? durationMin / 2
      : durationMin;

    if (existing) {
      existing.totalMinutes += weeklyMin;
      existing.slots.push({ dow: slot.day_of_week, start: slot.start_time, end: slot.end_time });
    } else {
      map.set(slot.class_id, {
        classId: slot.class_id,
        name: slot.classes?.name ?? "Classe inconnue",
        subject: slot.classes?.subject ?? slot.subject_label ?? null,
        totalMinutes: weeklyMin,
        slots: [{ dow: slot.day_of_week, start: slot.start_time, end: slot.end_time }],
      });
    }
  }

  // Sort each class's slots by day then start time
  for (const summary of map.values()) {
    summary.slots.sort((a, b) => a.dow - b.dow || timeToMinutes(a.start) - timeToMinutes(b.start));
  }

  // Return sorted by class name
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function formatHours(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (m === 0) return `${h}h/sem`;
  return `${h}h${String(m).padStart(2, "0")}/sem`;
}

export function ClassHoursSummary({ slots }: Props) {
  const summaries = buildSummaries(slots);

  if (summaries.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
        Heures par classe
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((cls) => (
          <div
            key={cls.classId}
            className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-bold text-[rgb(var(--ink))]">{cls.name}</p>
                {cls.subject && (
                  <p className="mt-0.5 truncate text-xs text-[rgb(var(--ink-3))]">{cls.subject}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-lg bg-[rgb(var(--accent))]/10 px-2 py-0.5">
                <Clock className="h-3 w-3 text-[rgb(var(--accent))]" aria-hidden="true" />
                <span className="text-xs font-semibold text-[rgb(var(--accent))]">
                  {formatHours(cls.totalMinutes)}
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[rgb(var(--ink-3))]">
              {cls.slots
                .map((s) => `${DAY_SHORT[s.dow] ?? "?"} ${formatTime(s.start)}-${formatTime(s.end)}`)
                .join(", ")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
