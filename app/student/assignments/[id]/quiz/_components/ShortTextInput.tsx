"use client";

import { useState } from "react";
import { Check } from "lucide-react";

type Props = {
  answered: boolean;
  expectedAnswers: string[] | null;
  onSubmit: (isCorrect: boolean) => void;
};

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function ShortTextInput({ answered, expectedAnswers, onSubmit }: Props) {
  const [value, setValue] = useState("");

  function handleSubmit() {
    if (answered || value.trim() === "") return;
    const normalized = normalize(value);
    const isCorrect =
      Array.isArray(expectedAnswers) &&
      expectedAnswers.some((ans) => normalize(ans) === normalized);
    onSubmit(isCorrect);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSubmit();
  }

  return (
    <div className="mt-6 space-y-3">
      <input
        type="text"
        maxLength={200}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={answered}
        placeholder="Votre réponse…"
        className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />

      {!answered && (
        <button
          onClick={handleSubmit}
          disabled={value.trim() === ""}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-500 py-3 font-black text-gray-950 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check size={16} />
          Valider
        </button>
      )}
    </div>
  );
}
