import { PERIODS } from "../_types";
import type { DraftQuestion } from "../_types";
import { TypeBadge } from "./TypeBadge";

export function DraftCard({
  draft,
  onChange,
}: {
  draft: DraftQuestion;
  onChange: (d: DraftQuestion) => void;
}) {
  const isTrueFalse = draft.type === "truefalse";

  return (
    <div
      className={`rounded-2xl border p-5 transition ${
        draft.kept
          ? "border-gray-700 bg-gray-900"
          : "border-gray-800 bg-gray-950 opacity-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <TypeBadge type={draft.type} />
          {draft.period && (
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
              {draft.period}
            </span>
          )}
          <span className="text-xs text-gray-500">
            {draft.kept ? "À conserver" : "Ignorée"}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ ...draft, kept: true })}
            className={`rounded-xl px-3 py-1.5 text-xs font-black ${
              draft.kept
                ? "bg-green-500 text-gray-950"
                : "border border-gray-700 text-gray-500"
            }`}
          >
            ✓ Garder
          </button>
          <button
            onClick={() => onChange({ ...draft, kept: false })}
            className={`rounded-xl px-3 py-1.5 text-xs font-black ${
              !draft.kept
                ? "bg-red-500 text-white"
                : "border border-gray-700 text-gray-500"
            }`}
          >
            ✗ Ignorer
          </button>
        </div>
      </div>

      <textarea
        value={draft.question}
        onChange={(e) => onChange({ ...draft, question: e.target.value })}
        rows={2}
        className="mt-3 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm font-bold text-white outline-none focus:border-purple-500"
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        {draft.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...draft, answer_index: i })}
              className={`shrink-0 h-5 w-5 rounded-full border-2 transition ${
                draft.answer_index === i
                  ? "border-green-500 bg-green-500"
                  : "border-gray-600"
              }`}
            />
            {isTrueFalse ? (
              <span className="text-sm text-white">{opt}</span>
            ) : (
              <input
                value={opt}
                onChange={(e) => {
                  const next = [...draft.options];
                  next[i] = e.target.value;
                  onChange({ ...draft, options: next });
                }}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white outline-none focus:border-purple-500"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select
          value={draft.period}
          onChange={(e) => onChange({ ...draft, period: e.target.value })}
          className="rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
        >
          <option value="">Période (optionnel)</option>
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <input
          value={draft.explanation}
          onChange={(e) => onChange({ ...draft, explanation: e.target.value })}
          placeholder="Explication..."
          className="rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-300 outline-none placeholder:text-gray-600 focus:border-purple-500"
        />
      </div>
    </div>
  );
}
