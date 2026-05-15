import { CheckCircle2, Trophy, Brain } from "lucide-react";
import { GRADE_LABEL } from "@/lib/grading";
import type { WeeklyStats } from "@/lib/types/student-dashboard";

type Props = { stats: WeeklyStats };

export default function WeeklyStatsBanner({ stats }: Props) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[rgb(var(--accent))]">
        Cette semaine
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

        <div className="flex flex-col gap-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-[rgb(var(--green))]" aria-hidden />
          <span className="serif text-2xl font-black text-[rgb(var(--ink))]">{stats.assignments_completed}</span>
          <span className="text-xs text-[rgb(var(--ink-3))]">Devoirs</span>
        </div>

        <div className="flex flex-col gap-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
          <Brain className="h-5 w-5 text-[rgb(var(--accent))]" aria-hidden />
          <span className="serif text-2xl font-black text-[rgb(var(--ink))]">{stats.questions_practiced}</span>
          <span className="text-xs text-[rgb(var(--ink-3))]">Questions</span>
        </div>

        <div className="flex flex-col gap-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
          <Trophy className="h-5 w-5 text-[rgb(var(--warm))]" aria-hidden />
          <span className="serif text-2xl font-black text-[rgb(var(--ink))]">
            {stats.avg_grade_letter ? GRADE_LABEL[stats.avg_grade_letter] : "—"}
          </span>
          <span className="text-xs text-[rgb(var(--ink-3))]">Note moyenne</span>
        </div>

      </div>
    </section>
  );
}
