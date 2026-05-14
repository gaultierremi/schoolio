import type { TeacherQuestion, ProposeState } from "../_types";
import { TypeBadge } from "./TypeBadge";
import { DifficultyStarsEditor } from "./DifficultyStarsEditor";

export function ValidatedCard({
  q,
  proposeState,
  onEdit,
  onDelete,
  onTogglePublic,
  onDuplicate,
  onUnvalidate,
  onPropose,
  onForcePropose,
  onDifficultyChange,
}: {
  q: TeacherQuestion;
  proposeState: ProposeState;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublic: () => void;
  onDuplicate: () => void;
  onUnvalidate: () => void;
  onPropose: () => void;
  onForcePropose: () => void;
  onDifficultyChange?: (newValue: 1 | 2 | 3 | null) => void;
}) {
  const isAiValidated = q.is_ai_generated === true && !!q.validated_at;
  const isPdfExtracted = q.origin === "extracted_from_pdf" && !!q.validated_at;

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={q.type} />
            {isAiValidated && (
              <span className="rounded-full bg-[rgb(var(--green))]/15 px-2 py-0.5 text-xs font-black text-[rgb(var(--green))]">
                ✓ Maïa
              </span>
            )}
            {isPdfExtracted && (
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-black text-cyan-700">
                ✓ 📄 PDF
              </span>
            )}
            <DifficultyStarsEditor
              questionId={q.id}
              value={q.difficulty_stars}
              onChange={onDifficultyChange}
            />
            {q.period && (
              <span className="rounded-full bg-[rgb(var(--surface-3))] px-2 py-0.5 text-xs text-[rgb(var(--ink-2))]">
                {q.period}
              </span>
            )}
            {q.subject_enum && (
              <span className="text-xs text-[rgb(var(--ink-3))]">{q.subject_enum}</span>
            )}
            {typeof q.use_count === "number" && (
              <span className="text-xs text-[rgb(var(--ink-3))]">{q.use_count} util.</span>
            )}
          </div>
          <p className="mt-2 font-bold text-[rgb(var(--ink))]">{q.question}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {q.type === "numeric" ? (
              <span className="rounded-lg bg-[rgb(var(--green))]/15 px-2 py-0.5 text-xs font-black text-[rgb(var(--green))]">
                {q.expected_numeric_answer ?? "—"}
                {q.numeric_unit ? ` ${q.numeric_unit}` : ""}
                {q.numeric_tolerance != null
                  ? ` (±${q.numeric_tolerance})`
                  : ""}
              </span>
            ) : q.type === "short_text" ? (
              (q.expected_text_answers ?? []).map((ans, i) => (
                <span
                  key={i}
                  className="rounded-lg bg-[rgb(var(--green))]/15 px-2 py-0.5 text-xs font-black text-[rgb(var(--green))]"
                >
                  {ans}
                </span>
              ))
            ) : (
              q.options.map((opt, i) => (
                <span
                  key={i}
                  className={`rounded-lg px-2 py-0.5 text-xs ${
                    i === q.answer_index
                      ? "bg-[rgb(var(--green))]/15 font-black text-[rgb(var(--green))]"
                      : "bg-[rgb(var(--surface-3))] text-[rgb(var(--ink-2))]"
                  }`}
                >
                  {opt}
                </span>
              ))
            )}
          </div>
          {q.explanation && (
            <p className="mt-1.5 text-xs italic text-[rgb(var(--ink-3))]">{q.explanation}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            onClick={onTogglePublic}
            className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
              q.is_public
                ? "bg-[rgb(var(--green))]/15 text-[rgb(var(--green))] hover:bg-[rgb(var(--green))]/25"
                : "border border-[rgb(var(--border))] text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
            }`}
          >
            {q.is_public ? "Publique" : "Privée"}
          </button>
          <button
            onClick={onEdit}
            className="rounded-xl border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-2))] hover:border-[rgb(var(--accent))]/50 hover:text-[rgb(var(--accent))]"
          >
            Éditer
          </button>
          <button
            onClick={onDuplicate}
            className="rounded-xl border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-2))] hover:border-blue-400 hover:text-blue-600"
          >
            Dupliquer
          </button>
          {isAiValidated && (
            <button
              onClick={onUnvalidate}
              className="rounded-xl border border-[rgb(var(--warm))]/30 px-3 py-1.5 text-xs font-bold text-[rgb(var(--warm))] hover:bg-[rgb(var(--warm))]/10"
            >
              Dépublier
            </button>
          )}
          <button
            onClick={onDelete}
            className="rounded-xl border border-[rgb(var(--red))]/30 px-3 py-1.5 text-xs font-bold text-[rgb(var(--red))] hover:bg-[rgb(var(--red))]/10"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mt-3 border-t border-[rgb(var(--border))] pt-3">
        {proposeState.kind === "idle" && (
          <button
            onClick={onPropose}
            className="rounded-xl bg-indigo-100 px-3 py-1.5 text-xs font-black text-indigo-700 transition hover:bg-indigo-200"
          >
            📤 Proposer au site HistoGuess
          </button>
        )}
        {proposeState.kind === "loading" && (
          <span className="text-xs text-[rgb(var(--ink-3))]">Vérification en cours...</span>
        )}
        {proposeState.kind === "proposed" && (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-[rgb(var(--green))]/15 px-3 py-1.5 text-xs font-black text-[rgb(var(--green))]">
            ✓ Proposée au site
          </span>
        )}
        {proposeState.kind === "duplicate" && (
          <div className="rounded-xl border border-[rgb(var(--warm))]/30 bg-[rgb(var(--warm))]/10 p-3">
            <p className="text-xs font-black text-[rgb(var(--warm))]">
              ⚠️ Question similaire déjà existante :
            </p>
            <p className="mt-1 text-xs italic text-[rgb(var(--ink-2))]">
              &ldquo;{proposeState.similarText}&rdquo;
            </p>
            <button
              onClick={onForcePropose}
              className="mt-2 rounded-lg bg-[rgb(var(--warm))]/25 px-3 py-1.5 text-xs font-black text-[rgb(var(--warm))] hover:bg-[rgb(var(--warm))]/40"
            >
              Proposer quand même
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
