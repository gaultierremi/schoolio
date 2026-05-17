"use client";

const HOUR_START = 7;
const HOUR_END = 20;
const TOTAL_MINUTES = (HOUR_END - HOUR_START) * 60; // 780
const PX_PER_MIN = 1;

const DAYS = [
  { label: "Lundi", dow: 1 },
  { label: "Mardi", dow: 2 },
  { label: "Mercredi", dow: 3 },
  { label: "Jeudi", dow: 4 },
  { label: "Vendredi", dow: 5 },
  { label: "Samedi", dow: 6 },
  { label: "Dimanche", dow: 0 },
];

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
  weekFilter: "all" | "A" | "B";
  onCellClick: (dow: number, time: string) => void;
  onSlotClick: (slot: Slot) => void;
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function slotVisible(slot: Slot, filter: "all" | "A" | "B"): boolean {
  if (filter === "all") return true;
  return slot.week_pattern === "all" || slot.week_pattern === filter;
}

export function ScheduleGrid({ slots, weekFilter, onCellClick, onSlotClick }: Props) {
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  return (
    <div className="flex overflow-x-auto">
      {/* Hour labels */}
      <div className="relative w-12 flex-shrink-0" style={{ height: TOTAL_MINUTES * PX_PER_MIN }}>
        {hours.map((h) => (
          <div
            key={h}
            className="absolute right-1 text-xs text-[rgb(var(--ink-3))]"
            style={{ top: (h - HOUR_START) * 60 * PX_PER_MIN - 6 }}
          >
            {h}h
          </div>
        ))}
      </div>

      {/* Day columns */}
      {DAYS.map(({ label, dow }) => {
        const isWeekend = dow === 0 || dow === 6;
        const daySlots = slots.filter((s) => s.day_of_week === dow && slotVisible(s, weekFilter));

        return (
          <div key={dow} className="relative min-w-[100px] flex-1 border-l border-[rgb(var(--border))]">
            {/* Header */}
            <div className={`sticky top-0 z-10 border-b border-[rgb(var(--border))] py-1 text-center text-xs font-semibold ${isWeekend ? "bg-[rgb(var(--surface-3))] text-[rgb(var(--ink-3))]" : "bg-[rgb(var(--surface-2))] text-[rgb(var(--ink-2))]"}`}>
              {label}
            </div>

            {/* Grid area */}
            <div
              className={`relative cursor-pointer ${isWeekend ? "bg-[rgb(var(--surface-3))]/50" : "bg-[rgb(var(--surface))]"}`}
              style={{ height: TOTAL_MINUTES * PX_PER_MIN }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const clickedMin = HOUR_START * 60 + Math.floor(y / PX_PER_MIN);
                const snapped = Math.round(clickedMin / 15) * 15;
                onCellClick(dow, minutesToHHMM(snapped));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onCellClick(dow, minutesToHHMM(HOUR_START * 60));
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Créer un créneau pour ${label}`}
            >
              {/* Hour grid lines */}
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute w-full border-t border-[rgb(var(--border))]/60"
                  style={{ top: (h - HOUR_START) * 60 * PX_PER_MIN }}
                />
              ))}

              {/* Slots */}
              {daySlots.map((slot) => {
                const startMin = timeToMinutes(slot.start_time);
                const endMin = timeToMinutes(slot.end_time);
                const top = (startMin - HOUR_START * 60) * PX_PER_MIN;
                const height = (endMin - startMin) * PX_PER_MIN;
                const label = slot.classes?.name ?? slot.subject_label ?? "—";
                const color = slot.custom_color ?? "#6366f1";
                const patternBadge = slot.week_pattern !== "all" ? slot.week_pattern : null;

                return (
                  <div
                    key={slot.id}
                    className="absolute left-0.5 right-0.5 rounded overflow-hidden cursor-pointer hover:brightness-110 transition-all"
                    style={{ top, height, backgroundColor: color + "cc", borderLeft: `3px solid ${color}` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSlotClick(slot);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onSlotClick(slot);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Créneau ${label} ${slot.start_time} - ${slot.end_time}`}
                  >
                    <div className="px-1 py-0.5 h-full flex flex-col justify-start">
                      <span className="text-white text-[10px] font-semibold leading-tight truncate">{label}</span>
                      {height >= 30 && (
                        <span className="text-white/70 text-[9px] leading-tight">{slot.start_time}–{slot.end_time}</span>
                      )}
                      {patternBadge && height >= 40 && (
                        <span className="text-white/80 text-[9px] font-bold mt-auto">{patternBadge}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
