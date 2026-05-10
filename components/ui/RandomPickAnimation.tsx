"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

/**
 * // const candidates = [
 * //   { id: "1", name: "Marie Dupont" },
 * //   { id: "2", name: "Pierre Martin" },
 * //   { id: "3", name: "Sophie K." },
 * // ];
 * // const selected = candidates[1]; // décidé par l'API serveur
 *
 * // <RandomPickAnimation
 * //   candidates={candidates}
 * //   selectedStudent={selected}
 * //   isVisible={showPick}
 * //   onComplete={() => recordPickInDb(selected.id)}
 * //   onClose={() => setShowPick(false)}
 * // />
 */
export type Student = {
  id: string;
  name: string;
  avatar?: string;
};

export type RandomPickAnimationProps = {
  candidates: Student[];
  selectedStudent: Student;
  isVisible: boolean;
  onComplete?: () => void;
  onClose: () => void;
  duration?: number;
  className?: string;
};

type AnimationPhase = "rolling" | "revealed";

const minimumDurationMs = 500;
const defaultDurationMs = 1500;
const revealScaleDurationMs = 300;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getInitials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function getRandomCandidate(candidates: Student[], fallback: Student) {
  if (candidates.length === 0) {
    return fallback;
  }

  return candidates[Math.floor(Math.random() * candidates.length)] ?? fallback;
}

function getRollingDelay(progress: number) {
  if (progress < 0.6) {
    return 50;
  }

  if (progress < 0.72) {
    return 100;
  }

  if (progress < 0.84) {
    return 200;
  }

  if (progress < 0.92) {
    return 400;
  }

  return 800;
}

function StudentAvatar({ student }: { student: Student }) {
  if (student.avatar) {
    return (
      <img
        alt=""
        className="h-20 w-20 rounded-full border-4 border-purple-500 object-cover shadow-lg shadow-purple-500/20"
        src={student.avatar}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-purple-500 bg-purple-500/20 text-2xl font-black text-purple-100 shadow-lg shadow-purple-500/20"
    >
      {getInitials(student.name)}
    </div>
  );
}

function CelebrationMarks() {
  const marks = ["✦", "◆", "✧", "●", "✦", "◆"];

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
      {marks.map((mark, index) => (
        <span
          className={cx(
            "absolute text-purple-200/50 animate-pulse",
            index === 0 && "left-8 top-8 text-xl",
            index === 1 && "right-10 top-12 text-sm",
            index === 2 && "bottom-16 left-12 text-lg",
            index === 3 && "bottom-10 right-16 text-xs",
            index === 4 && "left-1/2 top-6 text-sm",
            index === 5 && "bottom-8 left-1/3 text-base",
          )}
          key={`${mark}-${index}`}
        >
          {mark}
        </span>
      ))}
    </div>
  );
}

export function RandomPickAnimation({
  candidates,
  selectedStudent,
  isVisible,
  onComplete,
  onClose,
  duration = defaultDurationMs,
  className,
}: RandomPickAnimationProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);
  const completedRef = useRef(false);
  const safeDuration = Math.max(duration, minimumDurationMs);
  const [phase, setPhase] = useState<AnimationPhase>("rolling");
  const [displayedStudent, setDisplayedStudent] = useState<Student>(selectedStudent);
  const isRevealed = phase === "revealed";

  const focusableButtons = useMemo(
    () => [cancelButtonRef, confirmButtonRef],
    [],
  );

  useEffect(() => {
    if (!isVisible) {
      return undefined;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [isVisible]);

  useEffect(() => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current = [];
    completedRef.current = false;

    if (!isVisible || candidates.length === 0) {
      return undefined;
    }

    setPhase("rolling");
    setDisplayedStudent(
      candidates.length === 1 ? selectedStudent : getRandomCandidate(candidates, selectedStudent),
    );

    function revealSelection() {
      setDisplayedStudent(selectedStudent);
      setPhase("revealed");

      const completeTimeoutId = window.setTimeout(() => {
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
          confirmButtonRef.current?.focus();
        }
      }, revealScaleDurationMs);

      timeoutIdsRef.current.push(completeTimeoutId);
    }

    if (candidates.length === 1) {
      const revealTimeoutId = window.setTimeout(revealSelection, 120);
      timeoutIdsRef.current.push(revealTimeoutId);
      return () => {
        timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
        timeoutIdsRef.current = [];
      };
    }

    const startedAt = Date.now();
    const revealAt = startedAt + safeDuration * 0.95;

    function scheduleNextRoll() {
      const now = Date.now();

      if (now >= revealAt) {
        revealSelection();
        return;
      }

      setDisplayedStudent(getRandomCandidate(candidates, selectedStudent));

      const progress = (now - startedAt) / safeDuration;
      const timeoutId = window.setTimeout(scheduleNextRoll, getRollingDelay(progress));
      timeoutIdsRef.current.push(timeoutId);
    }

    scheduleNextRoll();

    return () => {
      timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutIdsRef.current = [];
    };
  }, [candidates, isVisible, onComplete, safeDuration, selectedStudent]);

  useEffect(() => {
    if (!isVisible || !isRevealed) {
      return undefined;
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isRevealed, isVisible, onClose]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    window.setTimeout(() => {
      dialogRef.current?.focus();
    }, 0);
  }, [isVisible]);

  if (!isVisible || candidates.length === 0) {
    return null;
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (!isRevealed || event.target !== event.currentTarget) {
      return;
    }

    onClose();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") {
      return;
    }

    if (!isRevealed) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const buttons = focusableButtons
      .map((buttonRef) => buttonRef.current)
      .filter((button): button is HTMLButtonElement => Boolean(button));

    const firstButton = buttons[0];
    const lastButton = buttons[buttons.length - 1];

    if (!firstButton || !lastButton) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    if (event.shiftKey && document.activeElement === firstButton) {
      event.preventDefault();
      lastButton.focus();
    } else if (!event.shiftKey && document.activeElement === lastButton) {
      event.preventDefault();
      firstButton.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 opacity-100 backdrop-blur-sm transition-opacity duration-200"
      onClick={handleBackdropClick}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={cx(
          "relative w-full max-w-md overflow-hidden rounded-3xl border-2 border-purple-500/40 bg-gradient-to-br from-purple-900/40 to-gray-900 p-8 text-center text-white shadow-2xl shadow-purple-950/30 outline-none transition-transform duration-300",
          isRevealed ? "scale-100 animate-pulse" : "scale-[0.98]",
          className,
        )}
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {isRevealed ? <CelebrationMarks /> : null}

        {isRevealed ? (
          <button
            aria-label="Fermer"
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl leading-none text-gray-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        ) : null}

        <h2 className="relative text-lg font-bold text-white" id={titleId}>
          {isRevealed ? "✨ C'est ton tour !" : "🎲 Tirage en cours..."}
        </h2>

        <div className="relative mt-8 flex flex-col items-center">
          <div
            className={cx(
              "transition-transform duration-300 ease-out",
              isRevealed ? "scale-100" : "scale-90",
            )}
          >
            <StudentAvatar student={displayedStudent} />
          </div>

          <div
            aria-live="polite"
            className={cx(
              "mt-6 min-h-24 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-5 transition-opacity duration-75",
              isRevealed ? "opacity-100" : "opacity-90",
            )}
          >
            <p
              className={cx(
                "break-words text-4xl font-black leading-tight text-white tabular-nums transition-transform duration-300 ease-out",
                isRevealed ? "scale-100" : "scale-95",
              )}
            >
              {displayedStudent.name}
            </p>
          </div>

          {isRevealed ? (
            <p className="mt-4 text-sm font-medium text-purple-100/80">
              Bonne chance !
            </p>
          ) : (
            <p className="mt-4 text-sm text-purple-100/60">
              La roulette choisit un élève...
            </p>
          )}
        </div>

        {isRevealed ? (
          <div className="relative mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-gray-700 bg-transparent px-4 py-2.5 text-sm font-semibold text-gray-300 transition-colors hover:border-gray-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-950"
              onClick={onClose}
              ref={cancelButtonRef}
              type="button"
            >
              Élève absent — annuler
            </button>
            <button
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-purple-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-950"
              onClick={onClose}
              ref={confirmButtonRef}
              type="button"
            >
              OK, c'est noté
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default RandomPickAnimation;
