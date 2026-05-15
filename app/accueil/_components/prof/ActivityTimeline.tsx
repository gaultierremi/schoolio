"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { GraduationCap, BookOpen, Cpu, MapPin, ChevronDown, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ActivityEvent = {
  id: string;
  event_type: string;
  actor_type: string;
  label: string;
  context: Record<string, unknown>;
  created_at: string;
};

type Filter = "all" | "students" | "teacher" | "system";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all",     label: "Tout"        },
  { key: "students", label: "Élèves"     },
  { key: "teacher",  label: "Professeur" },
  { key: "system",   label: "Système"    },
];

const ACTOR_ICON: Record<string, LucideIcon> = {
  student: GraduationCap,
  teacher: BookOpen,
  system:  Cpu,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

export default function ActivityTimeline({
  loadActivity,
}: {
  loadActivity: (filter: string, limit: number) => Promise<ActivityEvent[]>;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(
    async (f: Filter) => {
      setEventsLoading(true);
      const data = await loadActivity(f, 15);
      setEvents(data);
      setEventsLoading(false);
    },
    [loadActivity]
  );

  useEffect(() => {
    if (!open) return;
    loadedOnce.current = true;
    load(filter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter]);

  return (
    <section className="pb-8">
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))] transition hover:text-[rgb(var(--ink))]"
      >
        {open
          ? <ChevronDown className="h-3 w-3" aria-hidden />
          : <ChevronRight className="h-3 w-3" aria-hidden />}
        Activité récente
      </button>

      {open && (
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                  filter === f.key
                    ? "border border-[rgb(var(--accent))]/30 bg-[rgb(var(--accent-soft))]/30 text-[rgb(var(--accent))]"
                    : "border border-[rgb(var(--border))] text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {eventsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-[rgb(var(--surface-3))]" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="py-4 text-center text-sm text-[rgb(var(--ink-3))]">
              Aucune activité enregistrée.
            </p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => {
                const Icon = ACTOR_ICON[event.actor_type] ?? MapPin;
                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[rgb(var(--ink-3))]" aria-hidden />
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-[rgb(var(--ink))]">
                      {event.label}
                    </p>
                    <p className="shrink-0 whitespace-nowrap text-xs text-[rgb(var(--ink-3))]">
                      {timeAgo(event.created_at)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
