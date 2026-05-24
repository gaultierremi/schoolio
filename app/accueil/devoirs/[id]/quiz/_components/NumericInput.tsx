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
          // colorScheme: 'light' defeats Chrome's native dark <input> rendering
          // quand l'utilisateur a OS prefers-color-scheme: dark.
          style={{ colorScheme: "light" }}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {unit && (
          <span className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 select-none">
            {unit}
          </span>
        )}
      </div>

      {!answered && (
        <button
          onClick={handleSubmit}
          disabled={raw.trim() === "" || grading}
          className="
            inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2
            text-sm font-semibold text-white transition
            hover:bg-indigo-700
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-white
            disabled:cursor-not-allowed disabled:opacity-40
            motion-reduce:transition-none
          "
        >
          {grading ? (
            <>
              <Loader2 size={14} strokeWidth={2} className="animate-spin" aria-hidden="true" />
              Vérification…
            </>
          ) : (
            <>
              <Check size={14} strokeWidth={2} aria-hidden="true" />
              Valider
            </>
          )}
        </button>
      )}
    </div>
  );
}
