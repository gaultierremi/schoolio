"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ScheduleGrid } from "./_components/ScheduleGrid";
import { SlotModal } from "./_components/SlotModal";

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
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/school" className="text-gray-400 hover:text-white transition-colors text-sm">
            ← Tableau de bord
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Mon emploi du temps 🗓️</h1>
            <p className="text-gray-400 text-sm mt-1">Clique sur une case pour ajouter un créneau</p>
          </div>
          <button
            onClick={() => openCreate(1, "08:00")}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Ajouter un créneau
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {/* Week filter */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
            {(["all", "A", "B"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setWeekFilter(f)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${weekFilter === f ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
              >
                {f === "all" ? "Toutes" : `Sem. ${f}`}
              </button>
            ))}
          </div>

          {/* Week pattern override */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Semaine courante :</span>
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
              {([["auto", "Auto"], ["force_A", "A"], ["force_B", "B"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => void handleOverrideChange(val)}
                  className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${weekPatternOverride === val ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement…</div>
        ) : (
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
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
