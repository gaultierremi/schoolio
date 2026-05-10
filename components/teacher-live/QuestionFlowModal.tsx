"use client";

import type { ContextualQuestion } from "@/lib/contextual-questions";

export type QuestionFlowModalProps = {
  question: ContextualQuestion;
  stage: "projecting" | "revealed";
  isRevealing: boolean;
  onReveal: () => void;
  onBackToPdf: () => void;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function QuestionFlowModal({
  question,
  stage,
  isRevealing,
  onReveal,
  onBackToPdf,
}: QuestionFlowModalProps) {
  const correctLetter = String.fromCharCode(65 + question.answer_index);
  const isRevealed = stage === "revealed";

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-stretch justify-end bg-black/60 backdrop-blur-sm">
      <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-t-2 border-purple-500/40 bg-gray-900 p-5 shadow-2xl">
        <div className="mb-4">
          <span className="text-sm font-bold text-purple-300">
            {isRevealed ? "✅ Réponse révélée" : "📡 Projetée sur l'écran"}
          </span>
        </div>

        <p className="mb-4 text-base font-semibold leading-6 text-gray-100">
          {question.question}
        </p>

        <div className="mb-5 space-y-2">
          {question.options.map((text, i) => {
            const letter = String.fromCharCode(65 + i);
            const isCorrect = isRevealed && letter === correctLetter;
            return (
              <div
                className={cx(
                  "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                  isCorrect
                    ? "border-green-500/40 bg-green-500/10 text-green-100"
                    : isRevealed
                      ? "border-gray-800 bg-gray-950/40 text-gray-500"
                      : "border-gray-700 bg-gray-800/40 text-gray-300",
                )}
                key={letter}
              >
                <span
                  className={cx(
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                    isCorrect
                      ? "border-green-500/40 bg-green-500/10 text-green-300"
                      : "border-gray-700 bg-gray-800 text-gray-400",
                  )}
                >
                  {letter}
                </span>
                <span className="min-w-0 flex-1">{text}</span>
                {isCorrect ? <span className="shrink-0 text-green-300">✓</span> : null}
              </div>
            );
          })}
        </div>

        {isRevealed && question.explanation ? (
          <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-sm text-blue-200">
            <span className="font-semibold">Explication : </span>
            {question.explanation}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {!isRevealed ? (
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { label: "✅ Correct",   className: "bg-green-700 hover:bg-green-600" },
                  { label: "〜 Partiel",   className: "bg-yellow-700 hover:bg-yellow-600" },
                  { label: "❌ Faux",      className: "bg-red-700 hover:bg-red-600" },
                  { label: "🤷 Sait pas", className: "bg-gray-700 hover:bg-gray-600" },
                ] as const
              ).map(({ label, className }) => (
                <button
                  className={`rounded-xl py-3 text-sm font-bold text-white transition-colors disabled:opacity-60 ${className}`}
                  disabled={isRevealing}
                  key={label}
                  onClick={onReveal}
                  type="button"
                >
                  {isRevealing ? "…" : label}
                </button>
              ))}
            </div>
          ) : null}
          <button
            className="w-full rounded-xl border border-gray-700 py-3 text-sm font-semibold text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
            onClick={onBackToPdf}
            type="button"
          >
            ← Retour au PDF
          </button>
        </div>
      </div>
    </div>
  );
}

export default QuestionFlowModal;
