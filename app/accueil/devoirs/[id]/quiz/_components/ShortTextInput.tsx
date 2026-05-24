"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

type Props = {
  answered: boolean;
  grading: boolean;
  /** Server-side grading: parent receives the raw user input as a string. */
  onSubmit: (value: string) => void;
};

export function ShortTextInput({ answered, grading, onSubmit }: Props) {
  const [value, setValue] = useState("");

  function handleSubmit() {
    if (answered || grading || value.trim() === "") return;
    onSubmit(value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSubmit();
  }

  const disabled = answered || grading;

  return (
    <div className="mt-6 space-y-3">
      <input
        type="text"
        maxLength={200}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Votre réponse…"
        // colorScheme: 'light' defeats Chrome's native dark <input> rendering
        // when the user has OS-level prefers-color-scheme: dark.
        // Le quiz est toujours en light mode (card blanche) — pas de dark: variants.
        style={{ colorScheme: "light" }}
        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      />

      {!answered && (
        <button
          onClick={handleSubmit}
          disabled={value.trim() === "" || grading}
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
