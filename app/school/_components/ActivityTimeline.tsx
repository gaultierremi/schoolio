"use client";
import { useCallback, useEffect, useRef, useState } from "react";

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

const ACTOR_ICON: Record<string, string> = {
  student: "👩‍🎓",
  teacher: "👩‍🏫",
  system:  "🤖",
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
        className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-500 transition hover:text-gray-300"
      >
        <span className="text-[10px]">{open ? "▼" : "▶"}</span>
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
                    ? "border border-purple-500/30 bg-purple-500/20 text-purple-300"
                    : "border border-gray-700 text-gray-500 hover:text-white"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {eventsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-800" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-600">
              Aucune activité enregistrée.
            </p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3"
                >
                  <span className="shrink-0 text-base">
                    {ACTOR_ICON[event.actor_type] ?? "📍"}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-bold text-white">
                    {event.label}
                  </p>
                  <p className="shrink-0 whitespace-nowrap text-xs text-gray-600">
                    {timeAgo(event.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
