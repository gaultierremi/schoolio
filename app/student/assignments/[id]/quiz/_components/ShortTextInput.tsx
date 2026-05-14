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
        className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />

      {!answered && (
        <button
          onClick={handleSubmit}
          disabled={value.trim() === "" || grading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-500 py-3 font-black text-gray-950 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
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
