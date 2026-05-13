import { GRADE_LABEL } from "@/lib/grading";
import type { WeeklyStats } from "@/lib/types/student-dashboard";

type Props = { stats: WeeklyStats };

const STATS = [
  { key: "assignments_completed", label: "Devoirs", emoji: "✅" },
  { key: "questions_practiced",   label: "Questions", emoji: "🧠" },
] as const;

export default function WeeklyStatsBanner({ stats }: Props) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-purple-400">
        Cette semaine
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map(({ key, label, emoji }) => (
          <div
            key={key}
            className="flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"
          >
            <span className="text-xl leading-none">{emoji}</span>
            <span className="text-2xl font-black text-white">{stats[key]}</span>
            <span className="text-xs text-zinc-500">{label}</span>
          </div>
        ))}

        <div className="flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <span className="text-xl leading-none">🏆</span>
          <span className="text-2xl font-black text-white">
            {stats.avg_grade_letter ? GRADE_LABEL[stats.avg_grade_letter] : "—"}
          </span>
          <span className="text-xs text-zinc-500">Note moyenne</span>
        </div>
      </div>
    </section>
  );
}
