"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

type Props = {
  answered: boolean;
  grading: boolean;
  unit: string | null;
  /** Server-side grading: parent receives the raw user input as a number. */
  onSubmit: (value: number) => void;
};

export function NumericInput({ answered, grading, unit, onSubmit }: Props) {
  const [raw, setRaw] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Accept comma as decimal separator
    setRaw(e.target.value.replace(",", "."));
  }

  function handleSubmit() {
    if (answered || grading || raw.trim() === "") return;
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) return;
    onSubmit(value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSubmit();
  }

  const disabled = answered || grading;

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="any"
          value={raw}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Votre réponse…"
          className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        {unit && (
          <span className="shrink-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-3 text-sm text-slate-500 select-none">
            {unit}
          </span>
        )}
      </div>

      {!answered && (
        <button
          onClick={handleSubmit}
          disabled={raw.trim() === "" || grading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {grading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Vérification…
            </>
          ) : (
            <>
              <Check size={16} />
              Valider
            </>
          )}
        </button>
      )}
    </div>
  );
}
