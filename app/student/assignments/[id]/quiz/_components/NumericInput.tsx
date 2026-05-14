"use client";

import { useState } from "react";
import { Check } from "lucide-react";

type Props = {
  answered: boolean;
  expectedAnswer: number | null;
  tolerance: number | null;
  unit: string | null;
  onSubmit: (isCorrect: boolean) => void;
};

export function NumericInput({
  answered,
  expectedAnswer,
  tolerance,
  unit,
  onSubmit,
}: Props) {
  const [raw, setRaw] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Accept comma as decimal separator
    setRaw(e.target.value.replace(",", "."));
  }

  function handleSubmit() {
    if (answered || raw.trim() === "") return;
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) return;

    let isCorrect = false;
    if (expectedAnswer !== null) {
      const tol = tolerance ?? 0.01;
      isCorrect = Math.abs(value - expectedAnswer) <= tol;
    }
    onSubmit(isCorrect);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSubmit();
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="any"
          value={raw}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={answered}
          placeholder="Votre réponse…"
          className="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        {unit && (
          <span className="shrink-0 rounded-xl border border-gray-700 bg-gray-800 px-3 py-3 text-sm text-gray-500 select-none">
            {unit}
          </span>
        )}
      </div>

      {!answered && (
        <button
          onClick={handleSubmit}
          disabled={raw.trim() === ""}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-500 py-3 font-black text-gray-950 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check size={16} />
          Valider
        </button>
      )}
    </div>
  );
}
