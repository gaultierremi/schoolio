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
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={q.type} />
            {isAiValidated && (
              <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-black text-green-300">
                ✓ Maïa
              </span>
            )}
            {isPdfExtracted && (
              <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs font-black text-cyan-300">
                ✓ 📄 PDF
              </span>
            )}
            <DifficultyStarsEditor
              questionId={q.id}
              value={q.difficulty_stars}
              onChange={onDifficultyChange}
            />
            {q.period && (
              <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                {q.period}
              </span>
            )}
            {q.subject_enum && (
              <span className="text-xs text-gray-500">{q.subject_enum}</span>
            )}
            {typeof q.use_count === "number" && (
              <span className="text-xs text-gray-600">{q.use_count} util.</span>
            )}
          </div>
          <p className="mt-2 font-bold text-white">{q.question}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
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
            <p className="mt-1.5 text-xs italic text-gray-500">{q.explanation}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            onClick={onTogglePublic}
            className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
              q.is_public
                ? "bg-green-500/20 text-green-300 hover:bg-green-500/30"
                : "border border-gray-700 text-gray-500 hover:text-white"
            }`}
          >
            {q.is_public ? "Publique" : "Privée"}
          </button>
          <button
            onClick={onEdit}
            className="rounded-xl border border-gray-700 px-3 py-1.5 text-xs font-bold text-gray-300 hover:border-purple-500/50 hover:text-purple-300"
          >
            Éditer
          </button>
          <button
            onClick={onDuplicate}
            className="rounded-xl border border-gray-700 px-3 py-1.5 text-xs font-bold text-gray-400 hover:border-blue-500/50 hover:text-blue-300"
          >
            Dupliquer
          </button>
          {isAiValidated && (
            <button
              onClick={onUnvalidate}
              className="rounded-xl border border-amber-500/30 px-3 py-1.5 text-xs font-bold text-amber-400 hover:bg-amber-500/10"
            >
              Dépublier
            </button>
          )}
          <button
            onClick={onDelete}
            className="rounded-xl border border-red-500/30 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mt-3 border-t border-gray-800 pt-3">
        {proposeState.kind === "idle" && (
          <button
            onClick={onPropose}
            className="rounded-xl bg-indigo-500/20 px-3 py-1.5 text-xs font-black text-indigo-300 transition hover:bg-indigo-500/30"
          >
            📤 Proposer au site HistoGuess
          </button>
        )}
        {proposeState.kind === "loading" && (
          <span className="text-xs text-gray-500">Vérification en cours...</span>
        )}
        {proposeState.kind === "proposed" && (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-green-500/20 px-3 py-1.5 text-xs font-black text-green-300">
            ✓ Proposée au site
          </span>
        )}
        {proposeState.kind === "duplicate" && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-xs font-black text-amber-300">
              ⚠️ Question similaire déjà existante :
            </p>
            <p className="mt-1 text-xs italic text-gray-400">
              &ldquo;{proposeState.similarText}&rdquo;
            </p>
            <button
              onClick={onForcePropose}
              className="mt-2 rounded-lg bg-amber-500/30 px-3 py-1.5 text-xs font-black text-amber-200 hover:bg-amber-500/50"
            >
              Proposer quand même
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
