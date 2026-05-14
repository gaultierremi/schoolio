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
          ? "border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
          : "border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] opacity-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <TypeBadge type={draft.type} />
          {draft.period && (
            <span className="rounded-full bg-[rgb(var(--surface-3))] px-2 py-0.5 text-xs text-[rgb(var(--ink-2))]">
              {draft.period}
            </span>
          )}
          <span className="text-xs text-[rgb(var(--ink-3))]">
            {draft.kept ? "À conserver" : "Ignorée"}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ ...draft, kept: true })}
            className={`rounded-xl px-3 py-1.5 text-xs font-black ${
              draft.kept
                ? "bg-[rgb(var(--green))] text-white"
                : "border border-[rgb(var(--border))] text-[rgb(var(--ink-3))]"
            }`}
          >
            ✓ Garder
          </button>
          <button
            onClick={() => onChange({ ...draft, kept: false })}
            className={`rounded-xl px-3 py-1.5 text-xs font-black ${
              !draft.kept
                ? "bg-[rgb(var(--red))] text-white"
                : "border border-[rgb(var(--border))] text-[rgb(var(--ink-3))]"
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
        className="mt-3 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm font-bold text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))]"
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        {draft.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...draft, answer_index: i })}
              className={`h-5 w-5 shrink-0 rounded-full border-2 transition ${
                draft.answer_index === i
                  ? "border-[rgb(var(--green))] bg-[rgb(var(--green))]"
                  : "border-[rgb(var(--border))]"
              }`}
            />
            {isTrueFalse ? (
              <span className="text-sm text-[rgb(var(--ink))]">{opt}</span>
            ) : (
              <input
                value={opt}
                onChange={(e) => {
                  const next = [...draft.options];
                  next[i] = e.target.value;
                  onChange({ ...draft, options: next });
                }}
                className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1.5 text-xs text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))]"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select
          value={draft.period}
          onChange={(e) => onChange({ ...draft, period: e.target.value })}
          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-xs text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))]"
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
          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-xs text-[rgb(var(--ink-2))] outline-none placeholder:text-[rgb(var(--ink-3))] focus:border-[rgb(var(--accent))]"
        />
      </div>
    </div>
  );
}
