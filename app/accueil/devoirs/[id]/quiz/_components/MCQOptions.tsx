"use client";

import { Loader2 } from "lucide-react";

type Props = {
  options: string[];
  answered: boolean;
  /** True while a server-side grading request is in flight. */
  grading: boolean;
  selected: number | null;
  answerIndex: number | null;
  wrongPhase: null | "choosing" | "revealed" | "help";
  onSelect: (idx: number) => void;
};

export function MCQOptions({
  options,
  answered,
  grading,
  selected,
  answerIndex,
  wrongPhase,
  onSelect,
}: Props) {
  const locked = answered || grading;

  function optionStyle(idx: number): string {
    if (!answered) {
      // While grading, mark the pending choice so the user gets feedback.
      if (grading && idx === selected) {
        return "border-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.08)] accent-text cursor-wait";
      }
      if (grading) {
        return "border-slate-200 dark:border-slate-800 text-slate-500 cursor-not-allowed";
      }
      return "border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-[rgb(var(--accent))] hover:bg-[rgb(var(--accent)/0.05)] cursor-pointer";
    }
    if (wrongPhase === "choosing" || wrongPhase === "help") {
      if (idx === selected) return "border-red-500 bg-red-500/10 text-red-300";
      return "border-slate-200 dark:border-slate-800 text-slate-500";
    }
    // null (correct) or "revealed" — show correct answer
    if (idx === answerIndex) return "border-green-500 bg-green-500/10 text-green-300 font-bold";
    if (idx === selected && idx !== answerIndex) return "border-red-500 bg-red-500/10 text-red-300";
    return "border-slate-200 dark:border-slate-800 text-slate-500";
  }

  return (
    <div className="mt-6 space-y-3">
      {options.map((opt, idx) => (
        <button
          key={idx}
          onClick={() => onSelect(idx)}
          disabled={locked}
          className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${optionStyle(idx)}`}
        >
          <span className="font-bold text-slate-500 mr-2">{String.fromCharCode(65 + idx)}.</span>
          {opt}
          {grading && idx === selected && (
            <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          )}
        </button>
      ))}
    </div>
  );
}
