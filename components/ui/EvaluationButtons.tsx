"use client";

import { useEffect, useState } from "react";

/**
 * // Notation simple (mobile, modal) :
 * // <EvaluationButtons
 * //   onEvaluate={(evaluation) => recordAnswer(evaluation)}
 * // />
 *
 * // Pendant chargement API :
 * // <EvaluationButtons
 * //   onEvaluate={handleEvaluate}
 * //   isLoading={isSaving}
 * // />
 *
 * // Mode lecture (réponse déjà notée) :
 * // <EvaluationButtons
 * //   onEvaluate={() => {}}
 * //   selectedEvaluation="correct"
 * // />
 *
 * // En ligne (desktop) :
 * // <EvaluationButtons
 * //   onEvaluate={handleEvaluate}
 * //   layout="row"
 * //   size="compact"
 * // />
 */
export type Evaluation = "correct" | "partial" | "wrong" | "no_answer";

export type EvaluationButtonsProps = {
  onEvaluate: (evaluation: Evaluation) => void;
  disabled?: boolean;
  isLoading?: boolean;
  selectedEvaluation?: Evaluation | null;
  layout?: "grid" | "row";
  size?: "compact" | "comfortable";
  className?: string;
};

type EvaluationButtonConfig = {
  evaluation: Evaluation;
  label: string;
  ariaLabel: string;
  icon: string;
  baseClasses: string;
  selectedClasses: string;
};

type EvaluationButtonsSize = NonNullable<EvaluationButtonsProps["size"]>;

const evaluationButtons: EvaluationButtonConfig[] = [
  {
    evaluation: "correct",
    label: "Correct",
    ariaLabel: "Noter comme correct",
    icon: "✓",
    baseClasses: "border-green-500/40 bg-green-500/10 text-green-300 hover:bg-green-500/20",
    selectedClasses: "bg-green-500/30 ring-2 ring-green-500",
  },
  {
    evaluation: "partial",
    label: "Partiel",
    ariaLabel: "Noter comme partiel",
    icon: "◐",
    baseClasses: "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
    selectedClasses: "bg-amber-500/30 ring-2 ring-amber-500",
  },
  {
    evaluation: "wrong",
    label: "Faux",
    ariaLabel: "Noter comme faux",
    icon: "✗",
    baseClasses: "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20",
    selectedClasses: "bg-red-500/30 ring-2 ring-red-500",
  },
  {
    evaluation: "no_answer",
    label: "Sait pas",
    ariaLabel: "L'élève ne sait pas",
    icon: "⏭️",
    baseClasses: "border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600",
    selectedClasses: "bg-gray-600 ring-2 ring-gray-400",
  },
];

const sizeClasses: Record<EvaluationButtonsSize, string> = {
  compact: "min-h-11 px-3 py-2 text-sm font-medium",
  comfortable: "min-h-14 px-4 py-3 text-base font-semibold",
};

const iconSizeClasses: Record<EvaluationButtonsSize, string> = {
  compact: "text-lg",
  comfortable: "text-2xl",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Spinner({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

export function EvaluationButtons({
  onEvaluate,
  disabled = false,
  isLoading = false,
  selectedEvaluation = null,
  layout = "grid",
  size = "comfortable",
  className,
}: EvaluationButtonsProps) {
  const [clickedEvaluation, setClickedEvaluation] = useState<Evaluation | null>(null);
  const isReadOnly = selectedEvaluation !== null && selectedEvaluation !== undefined;
  const buttonsDisabled = disabled || isLoading || isReadOnly;

  useEffect(() => {
    if (!isLoading) {
      setClickedEvaluation(null);
    }
  }, [isLoading]);

  function handleEvaluate(evaluation: Evaluation) {
    if (buttonsDisabled) {
      return;
    }

    setClickedEvaluation(evaluation);
    onEvaluate(evaluation);
  }

  return (
    <div
      className={cx(
        layout === "grid" ? "grid grid-cols-2 gap-2" : "flex flex-row gap-2",
        className,
      )}
    >
      {evaluationButtons.map((button) => {
        const isSelected = selectedEvaluation === button.evaluation;
        const isInactiveReadOnly = isReadOnly && !isSelected;
        const showSpinner = isLoading && clickedEvaluation === button.evaluation;

        return (
          <button
            aria-label={button.ariaLabel}
            aria-pressed={isSelected}
            className={cx(
              "inline-flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border text-center leading-none transition-colors duration-150 active:scale-95 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-gray-950",
              sizeClasses[size],
              button.baseClasses,
              isSelected && button.selectedClasses,
              buttonsDisabled &&
                "cursor-not-allowed opacity-50 active:scale-100",
              isInactiveReadOnly && "opacity-40",
            )}
            disabled={buttonsDisabled}
            key={button.evaluation}
            onClick={() => handleEvaluate(button.evaluation)}
            type="button"
          >
            {showSpinner ? (
              <Spinner className={size === "compact" ? "h-4 w-4" : "h-5 w-5"} />
            ) : (
              <span aria-hidden="true" className={iconSizeClasses[size]}>
                {button.icon}
              </span>
            )}
            <span>{button.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default EvaluationButtons;
