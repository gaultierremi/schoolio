"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";

type Slot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  week_pattern: string;
  class_id: string | null;
  subject_label: string | null;
  classes?: { id: string; name: string; subject: string | null } | null;
};

type Props = {
  slots: Slot[];
  weekPatternOverride: "auto" | "force_A" | "force_B";
};

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function currentWeekLetter(date: Date, override: "auto" | "force_A" | "force_B"): "A" | "B" {
  if (override === "force_A") return "A";
  if (override === "force_B") return "B";
  return getISOWeek(date) % 2 === 1 ? "A" : "B";
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function slotMatchesNow(slot: Slot, dow: number, weekLetter: "A" | "B"): boolean {
  if (slot.day_of_week !== dow) return false;
  if (slot.week_pattern !== "all" && slot.week_pattern !== weekLetter) return false;
  return true;
}

function computeState(
  slots: Slot[],
  override: "auto" | "force_A" | "force_B"
): {
  state: "live" | "imminent" | "hidden";
  slot?: Slot;
  nextSlot?: Slot;
  remainingMin?: number;
  gapMin?: number;
} {
  const now = new Date();
  const dow = now.getDay();
  const weekLetter = currentWeekLetter(now, override);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const todaySlots = slots
    .filter((s) => slotMatchesNow(s, dow, weekLetter))
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  const current = todaySlots.find(
    (s) => timeToMinutes(s.start_time) <= nowMin && nowMin < timeToMinutes(s.end_time)
  );
  if (current) {
    return {
      state: "live",
      slot: current,
      remainingMin: timeToMinutes(current.end_time) - nowMin,
    };
  }

  const next = todaySlots
    .filter((s) => timeToMinutes(s.start_time) > nowMin)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))[0];

  if (next) {
    const gap = timeToMinutes(next.start_time) - nowMin;
    if (gap <= 10) {
      return { state: "imminent", nextSlot: next, gapMin: gap };
    }
  }

  return { state: "hidden" };
}

export function CurrentClassBanner({ slots, weekPatternOverride }: Props) {
  const [ctx, setCtx] = useState(() => computeState(slots, weekPatternOverride));

  const refresh = useCallback(() => {
    setCtx(computeState(slots, weekPatternOverride));
  }, [slots, weekPatternOverride]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (ctx.state === "hidden") return null;

  if (ctx.state === "live" && ctx.slot) {
    const slot = ctx.slot;
    const label = slot.classes?.name ?? slot.subject_label ?? "Cours";
    const subject = slot.classes?.subject ?? null;
    const classHref = slot.class_id ? `/school/classes/${slot.class_id}` : "/school/schedule";

    return (
      <div className="flex items-center gap-4 rounded-xl border border-[rgb(var(--green))]/30 bg-[rgb(var(--green))]/5 px-5 py-4">
        <span className="relative flex h-3 w-3 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[rgb(var(--green))] opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[rgb(var(--green))]" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-[rgb(var(--ink))]">
            Cours en cours · {label}{subject ? ` · ${subject}` : ""}
          </p>
          {ctx.remainingMin !== undefined && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-[rgb(var(--ink-3))]">
              <Clock className="h-3 w-3" aria-hidden />
              Reste {ctx.remainingMin} min
            </p>
          )}
        </div>
        <Link
          href={classHref}
          className="flex-shrink-0 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--ink-2))] transition-colors hover:border-[rgb(var(--green))]/40 hover:text-[rgb(var(--ink))]"
        >
          Accéder à la classe →
        </Link>
      </div>
    );
  }

  if (ctx.state === "imminent" && ctx.nextSlot) {
    const next = ctx.nextSlot;
    const label = next.classes?.name ?? next.subject_label ?? "Cours";
    const classHref = next.class_id ? `/school/classes/${next.class_id}` : "/school/schedule";

    return (
      <div className="flex items-center gap-4 rounded-xl border border-[rgb(var(--warm))]/30 bg-[rgb(var(--warm))]/5 px-5 py-4">
        <span className="relative flex h-3 w-3 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[rgb(var(--warm))] opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[rgb(var(--warm))]" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-[rgb(var(--ink))]">
            Cours dans {ctx.gapMin} min — {label}
          </p>
          <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">{next.start_time.slice(0, 5)}</p>
        </div>
        <Link
          href={classHref}
          className="flex-shrink-0 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--ink-2))] transition-colors hover:border-[rgb(var(--warm))]/40 hover:text-[rgb(var(--ink))]"
        >
          Préparer la classe →
        </Link>
      </div>
    );
  }

  return null;
}
