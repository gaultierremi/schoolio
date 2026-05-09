import type { TeacherQuestion } from "../_types";
import { TypeBadge } from "./TypeBadge";
import { StarSelector } from "./StarSelector";

export function PendingCard({
  q,
  isFading,
  isValidating,
  isRejecting,
  isBusy,
  selectedStars,
  onStarChange,
  onValidate,
  onReject,
  onEdit,
}: {
  q: TeacherQuestion;
  isFading: boolean;
  isValidating: boolean;
  isRejecting: boolean;
  isBusy: boolean;
  selectedStars: 1 | 2 | 3 | null;
  onStarChange: (v: 1 | 2 | 3) => void;
  onValidate: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-700 bg-gray-900 p-4 transition-opacity duration-200 ${
        isFading ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <TypeBadge type={q.type} />
        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-black text-indigo-300">
          IA
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

      <p className="font-bold text-white">{q.question}</p>

      <div className="mt-2 flex flex-wrap gap-1">
        {q.options.map((opt, i) => (
          <span
            key={i}
            className={`rounded-lg px-2 py-0.5 text-xs ${
              i === q.answer_index
                ? "bg-green-500/20 font-black text-green-300"
                : "bg-gray-800 text-gray-400"
            }`}
          >
            {opt}
          </span>
        ))}
      </div>

      {q.explanation && (
        <p className="mt-2 text-xs italic text-gray-500">{q.explanation}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-800 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Difficulté :</span>
          <StarSelector value={selectedStars} onChange={onStarChange} />
        </div>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={onEdit}
            disabled={isBusy}
            className="rounded-xl border border-gray-700 px-3 py-1.5 text-xs font-bold text-gray-300 hover:border-purple-500/50 hover:text-purple-300 disabled:opacity-40"
          >
            Modifier
          </button>
          <button
            onClick={onReject}
            disabled={isBusy}
            className="rounded-xl border border-red-500/30 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10 disabled:opacity-40"
          >
            {isRejecting ? "…" : "Rejeter"}
          </button>
          <button
            onClick={onValidate}
            disabled={isBusy}
            className="rounded-xl bg-green-500 px-4 py-1.5 text-xs font-black text-gray-950 hover:bg-green-400 disabled:opacity-40"
          >
            {isValidating ? "…" : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
}
