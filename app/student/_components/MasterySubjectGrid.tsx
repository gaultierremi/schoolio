import { SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId } from "@/lib/subjects";

export type SubjectMastery = {
  subjectId: string;
  averageScore: number;
  conceptCount: number;
};

export default function MasterySubjectGrid({ subjects }: { subjects: SubjectMastery[] }) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-black text-white">🧠 Ma maîtrise</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {subjects.map((s) => {
          const meta = SUBJECTS_BY_ID[s.subjectId as SubjectId];
          const label = meta?.label ?? s.subjectId;
          const emoji = meta?.emoji ?? "📚";
          const pct = Math.min(100, Math.max(0, s.averageScore));
          const barColor =
            pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";

          return (
            <div
              key={s.subjectId}
              className="flex flex-col gap-2 rounded-2xl border border-gray-800 bg-gray-900 p-4"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-base">{emoji}</span>
                <span className="truncate text-xs font-bold text-white">{label}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                  className={`h-full rounded-full ${barColor} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-white">{pct}%</span>
                <span className="text-[10px] text-gray-600">
                  {s.conceptCount} concept{s.conceptCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
