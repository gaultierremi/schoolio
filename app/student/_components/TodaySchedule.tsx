import { EmptyState } from "@/components/ui/EmptyState";
import type { ScheduleSlot } from "@/lib/types/student-dashboard";

type Props = { slots: ScheduleSlot[] };

export default function TodaySchedule({ slots }: Props) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-purple-400">
        Aujourd'hui
      </h2>

      {slots.length === 0 ? (
        <EmptyState
          variant="compact"
          icon="🌴"
          title="Pas de cours aujourd'hui"
          description="Profites-en pour réviser !"
        />
      ) : (
        <ul className="space-y-2">
          {slots.map((s, i) => (
            <li
              key={i}
              className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"
            >
              <div className="w-20 shrink-0 text-center">
                <span className="block text-sm font-bold text-white">{s.time_start}</span>
                <span className="block text-xs text-zinc-500">{s.time_end}</span>
              </div>
              <div className="min-w-0 flex-1 border-l border-zinc-700 pl-4">
                <p className="truncate font-semibold text-white">{s.course_title}</p>
                <p className="truncate text-xs text-zinc-500">{s.teacher_name}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
