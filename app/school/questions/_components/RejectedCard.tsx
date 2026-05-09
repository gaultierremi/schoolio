import type { TeacherQuestion } from "../_types";
import { TypeBadge } from "./TypeBadge";

export function RejectedCard({
  q,
  onRestore,
  onDelete,
}: {
  q: TeacherQuestion;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-gray-900 p-4">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={q.type} />
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-black text-red-300">
            Rejetée
          </span>
          {q.period && (
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
              {q.period}
            </span>
          )}
          {q.subject_enum && (
            <span className="text-xs text-gray-500">{q.subject_enum}</span>
          )}
        </div>
        <p className="mt-2 font-bold text-gray-400">{q.question}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <button
          onClick={onRestore}
          className="rounded-xl bg-amber-500/20 px-3 py-1.5 text-xs font-black text-amber-300 hover:bg-amber-500/30"
        >
          Restaurer
        </button>
        <button
          onClick={onDelete}
          className="rounded-xl border border-red-500/30 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
