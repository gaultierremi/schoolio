"use client";

import type { KeyboardEvent } from "react";
import { QuestionOriginBadge } from "./QuestionOriginBadge";

/**
 * // Question simple compacte :
 * // <ContextualQuestionCard
 * //   questionId="q-123"
 * //   questionText="Quelle est la formule de NaCl ?"
 * //   options={[
 * //     { letter: "A", text: "Na2Cl" },
 * //     { letter: "B", text: "NaCl" },
 * //     { letter: "C", text: "NaCl2" },
 * //     { letter: "D", text: "Cl-Na" },
 * //   ]}
 * //   correctAnswerLetter="B"
 * //   origin="extracted_from_pdf"
 * //   pageRange={{ start: 12, end: 15 }}
 * //   onClick={() => projectQuestion("q-123")}
 * // />
 *
 * // Question déjà projetée :
 * // <ContextualQuestionCard
 * //   ...
 * //   alreadyProjected
 * //   onClick={...}
 * // />
 *
 * // Pendant la projection :
 * // <ContextualQuestionCard
 * //   ...
 * //   isProjecting
 * //   onClick={...}
 * // />
 */
export type QuestionOption = {
  letter: string;
  text: string;
};

export type ContextualQuestionCardProps = {
  questionId: string;
  questionText: string;
  options: QuestionOption[];
  correctAnswerLetter?: string;
  origin: "ai_generated" | "extracted_from_pdf" | "ai_live";
  pageRange?: { start: number; end: number };
  alreadyProjected?: boolean;
  isProjecting?: boolean;
  onClick: () => void;
  size?: "compact" | "comfortable";
  className?: string;
};

type QuestionOrigin = ContextualQuestionCardProps["origin"];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatPageRange(pageRange?: { start: number; end: number }) {
  if (!pageRange) {
    return null;
  }

  if (pageRange.start === pageRange.end) {
    return `p. ${pageRange.start}`;
  }

  return `p. ${pageRange.start}-${pageRange.end}`;
}

function getTruncatedQuestion(questionText: string) {
  if (questionText.length <= 90) {
    return questionText;
  }

  return `${questionText.slice(0, 87).trim()}...`;
}

function OriginBadge({ origin }: { origin: QuestionOrigin }) {
  if (origin === "ai_live") {
    return (
      <span
        aria-label="Question générée en live par Maïa"
        className="inline-flex min-h-6 shrink-0 items-center justify-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-950/40 px-2 py-0.5 text-xs font-medium leading-none text-cyan-300"
        title="Question générée en live par Maïa"
      >
        <span aria-hidden="true">⚡</span>
        <span>Live</span>
      </span>
    );
  }

  return <QuestionOriginBadge origin={origin} />;
}

function OptionLetter({
  letter,
  isCorrect,
}: {
  letter: string;
  isCorrect?: boolean;
}) {
  return (
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
  );
}

export function ContextualQuestionCard({
  questionId,
  questionText,
  options,
  correctAnswerLetter,
  origin,
  pageRange,
  alreadyProjected = false,
  isProjecting = false,
  onClick,
  size = "compact",
  className,
}: ContextualQuestionCardProps) {
  const pageRangeLabel = formatPageRange(pageRange);
  const isDisabled = alreadyProjected || isProjecting;
  const accessibleQuestion = getTruncatedQuestion(questionText);

  function handleActivate() {
    if (isDisabled) {
      return;
    }

    onClick();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleActivate();
    }
  }

  return (
    <button
      aria-label={`Question : ${accessibleQuestion}. Cliquer pour projeter.`}
      aria-pressed={isProjecting}
      className={cx(
        "group flex w-full min-h-11 flex-col rounded-xl border border-gray-800 bg-gray-900 text-left shadow-sm transition-all duration-150 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-950/20 active:scale-95 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-gray-950",
        size === "compact" ? "gap-2 p-3" : "gap-3 p-4",
        alreadyProjected && "cursor-not-allowed opacity-60 hover:border-gray-800 hover:shadow-none active:scale-100",
        isProjecting && "animate-pulse border-purple-500/50 ring-2 ring-purple-500",
        className,
      )}
      data-question-id={questionId}
      disabled={isDisabled}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      role="button"
      type="button"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <OriginBadge origin={origin} />
          {alreadyProjected ? (
            <span className="inline-flex min-h-6 items-center rounded-md border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-400">
              ✓ Déjà projetée
            </span>
          ) : null}
        </span>
        {pageRangeLabel ? (
          <span className="shrink-0 text-xs text-gray-500">{pageRangeLabel}</span>
        ) : null}
      </span>

      <span
        className={cx(
          "text-gray-200",
          size === "compact"
            ? "overflow-hidden text-sm font-medium [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]"
            : "text-base font-semibold leading-6",
        )}
      >
        {questionText}
      </span>

      {isProjecting ? (
        <span className="mt-1 text-sm font-medium text-purple-300">
          Projection en cours...
        </span>
      ) : size === "compact" ? (
        <span className="flex w-full items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5">
            {options.slice(0, 4).map((option) => (
              <OptionLetter key={`${questionId}-${option.letter}`} letter={option.letter} />
            ))}
          </span>
          <span
            aria-hidden="true"
            className="shrink-0 text-lg leading-none text-gray-500 transition-colors group-hover:text-purple-300"
          >
            →
          </span>
        </span>
      ) : (
        <span className="flex flex-col gap-2">
          {options.map((option) => {
            const isCorrect = option.letter === correctAnswerLetter;

            return (
              <span
                className={cx(
                  "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                  isCorrect
                    ? "border-green-500/20 bg-green-500/5 text-green-100"
                    : "border-gray-800 bg-gray-950/40 text-gray-300",
                )}
                key={`${questionId}-${option.letter}`}
              >
                <OptionLetter isCorrect={isCorrect} letter={option.letter} />
                <span className="min-w-0 flex-1">{option.text}</span>
                {isCorrect ? (
                  <span aria-label="Bonne réponse" className="shrink-0 text-green-300">
                    ✓
                  </span>
                ) : null}
              </span>
            );
          })}
        </span>
      )}

      {size === "comfortable" && !isProjecting ? (
        <span className="mt-1 flex items-center justify-between gap-3 border-t border-gray-800 pt-3">
          <span className="flex items-center gap-2">
            <OriginBadge origin={origin} />
            {pageRangeLabel ? (
              <span className="text-xs text-gray-500">{pageRangeLabel}</span>
            ) : null}
          </span>
          <span className="text-sm font-medium text-purple-300">
            Projeter →
          </span>
        </span>
      ) : null}
    </button>
  );
}

export default ContextualQuestionCard;
