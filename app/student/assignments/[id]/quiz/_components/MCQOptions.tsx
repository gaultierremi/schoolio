"use client";

type Props = {
  options: string[];
  answered: boolean;
  selected: number | null;
  answerIndex: number | null;
  wrongPhase: null | "choosing" | "revealed" | "help";
  onSelect: (idx: number) => void;
};

export function MCQOptions({
  options,
  answered,
  selected,
  answerIndex,
  wrongPhase,
  onSelect,
}: Props) {
  function optionStyle(idx: number): string {
    if (!answered) {
      return "border-gray-700 text-gray-300 hover:border-purple-500/60 hover:bg-purple-500/5 cursor-pointer";
    }
    if (wrongPhase === "choosing" || wrongPhase === "help") {
      if (idx === selected) return "border-red-500 bg-red-500/10 text-red-300";
      return "border-gray-800 text-gray-600";
    }
    // null (correct) or "revealed" — show correct answer
    if (idx === answerIndex) return "border-green-500 bg-green-500/10 text-green-300 font-bold";
    if (idx === selected && idx !== answerIndex) return "border-red-500 bg-red-500/10 text-red-300";
    return "border-gray-800 text-gray-600";
  }

  return (
    <div className="mt-6 space-y-3">
      {options.map((opt, idx) => (
        <button
          key={idx}
          onClick={() => onSelect(idx)}
          disabled={answered}
          className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${optionStyle(idx)}`}
        >
          <span className="font-bold text-gray-500 mr-2">{String.fromCharCode(65 + idx)}.</span>
          {opt}
        </button>
      ))}
    </div>
  );
}
