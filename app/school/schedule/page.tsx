"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { ScheduleGrid } from "./_components/ScheduleGrid";
import { SlotModal } from "./_components/SlotModal";
import { ClassHoursSummary } from "./_components/ClassHoursSummary";

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

type ClassOption = { id: string; name: string; subject: string | null };

type ModalState = {
  open: boolean;
  slot: Slot | null;
  defaultDay?: number;
  defaultTime?: string;
};

export default function SchedulePage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [weekFilter, setWeekFilter] = useState<"all" | "A" | "B">("all");
  const [weekPatternOverride, setWeekPatternOverride] = useState<"auto" | "force_A" | "force_B">("auto");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [modal, setModal] = useState<ModalState>({ open: false, slot: null });
  const [loading, setLoading] = useState(true);

  const loadSchedule = useCallback(async () => {
    const res = await fetch("/api/school/schedule");
    if (!res.ok) return;
    const data = await res.json() as { slots: Slot[]; week_pattern_override: string };
    setSlots(data.slots);
    setWeekPatternOverride((data.week_pattern_override as "auto" | "force_A" | "force_B") ?? "auto");
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      await Promise.all([
        loadSchedule(),
        fetch("/api/classes")
          .then((r) => r.json() as Promise<{ classes: ClassOption[] }>)
          .then((d) => setClasses(d.classes ?? [])),
      ]);
      setLoading(false);
    }
    void load();
  }, [loadSchedule]);

  async function handleOverrideChange(val: "auto" | "force_A" | "force_B") {
    setWeekPatternOverride(val);
    await fetch("/api/school/schedule/week-pattern-override", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ override: val }),
    });
  }

  function openCreate(dow: number, time: string) {
    setModal({ open: true, slot: null, defaultDay: dow, defaultTime: time });
  }

  function openEdit(slot: Slot) {
    setModal({ open: true, slot });
  }

  function closeModal() {
    setModal({ open: false, slot: null });
  }

  async function onSaved() {
    closeModal();
    await loadSchedule();
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--surface-2))] text-[rgb(var(--ink))]">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link href="/school" className="text-sm text-[rgb(var(--ink-2))] transition-colors hover:text-[rgb(var(--ink))]">
            ← Tableau de bord
          </Link>
        </div>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="serif flex items-center gap-2 text-2xl font-bold text-[rgb(var(--ink))]">
              <CalendarDays className="h-6 w-6 shrink-0" aria-hidden="true" />
              Mon horaire
            </h1>
            <p className="mt-1 text-sm text-[rgb(var(--ink-2))]">Clique sur une case pour ajouter un créneau</p>
          </div>
          <button
            onClick={() => openCreate(1, "08:00")}
            className="rounded-lg bg-[rgb(var(--accent))] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            + Ajouter un créneau
          </button>
        </div>

        {/* Controls */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          {/* Week filter */}
          <div className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1">
            {(["all", "A", "B"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setWeekFilter(f)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${weekFilter === f ? "bg-[rgb(var(--accent))] text-white" : "text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))]"}`}
              >
                {f === "all" ? "Toutes" : `Sem. ${f}`}
              </button>
            ))}
          </div>

          {/* Week pattern override */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[rgb(var(--ink-3))]">Semaine courante :</span>
            <div className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1">
              {([["auto", "Auto"], ["force_A", "A"], ["force_B", "B"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => void handleOverrideChange(val)}
                  className={`rounded px-2.5 py-0.5 text-xs font-medium transition-colors ${weekPatternOverride === val ? "bg-[rgb(var(--accent))] text-white" : "text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Class hours summary */}
        {!loading && slots.length > 0 && (
          <ClassHoursSummary slots={slots} />
        )}

        {/* Grid */}
        {loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-[rgb(var(--ink-3))]">Chargement…</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
            <ScheduleGrid
              slots={slots}
              weekFilter={weekFilter}
              onCellClick={openCreate}
              onSlotClick={openEdit}
            />
          </div>
        )}
      </div>

      {modal.open && (
        <SlotModal
          slot={modal.slot}
          defaultDay={modal.defaultDay}
          defaultTime={modal.defaultTime}
          classes={classes}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
