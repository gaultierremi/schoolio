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
    <div className="flex items-start gap-3 rounded-2xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--surface))] p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={q.type} />
          <span className="rounded-full bg-[rgb(var(--red))]/10 px-2 py-0.5 text-xs font-black text-[rgb(var(--red))]">
            Rejetée
          </span>
          {q.period && (
            <span className="rounded-full bg-[rgb(var(--surface-3))] px-2 py-0.5 text-xs text-[rgb(var(--ink-2))]">
              {q.period}
            </span>
          )}
          {q.subject_enum && (
            <span className="text-xs text-[rgb(var(--ink-3))]">{q.subject_enum}</span>
          )}
        </div>
        <p className="mt-2 font-bold text-[rgb(var(--ink-2))]">{q.question}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <button
          onClick={onRestore}
          className="rounded-xl bg-[rgb(var(--warm))]/15 px-3 py-1.5 text-xs font-black text-[rgb(var(--warm))] hover:bg-[rgb(var(--warm))]/25"
        >
          Restaurer
        </button>
        <button
          onClick={onDelete}
          className="rounded-xl border border-[rgb(var(--red))]/30 px-3 py-1.5 text-xs font-bold text-[rgb(var(--red))] hover:bg-[rgb(var(--red))]/10"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
