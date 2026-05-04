"use client";

import { SUBJECTS } from "@/lib/subjects";

// Explicit color map — dynamic class names don't survive Tailwind's static scan
const colorMap: Record<string, { border: string; bg: string; text: string }> = {
  amber:  { border: "border-amber-500/50",  bg: "bg-amber-500/10",  text: "text-amber-300"  },
  blue:   { border: "border-blue-500/50",   bg: "bg-blue-500/10",   text: "text-blue-300"   },
  green:  { border: "border-green-500/50",  bg: "bg-green-500/10",  text: "text-green-300"  },
  teal:   { border: "border-teal-500/50",   bg: "bg-teal-500/10",   text: "text-teal-300"   },
  purple: { border: "border-purple-500/50", bg: "bg-purple-500/10", text: "text-purple-300" },
  red:    { border: "border-red-500/50",    bg: "bg-red-500/10",    text: "text-red-300"    },
  pink:   { border: "border-pink-500/50",   bg: "bg-pink-500/10",   text: "text-pink-300"   },
  orange: { border: "border-orange-500/50", bg: "bg-orange-500/10", text: "text-orange-300" },
  indigo: { border: "border-indigo-500/50", bg: "bg-indigo-500/10", text: "text-indigo-300" },
  gray:   { border: "border-gray-500/50",   bg: "bg-gray-500/10",   text: "text-gray-300"   },
};

type Props = {
  selected: string[];
  onToggle: (id: string) => void;
};

export default function SubjectSelector({ selected, onToggle }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {SUBJECTS.map((s) => {
        const isSelected = selected.includes(s.id);
        const c = colorMap[s.color] ?? colorMap.gray;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.98] ${
              isSelected
                ? `${c.border} ${c.bg}`
                : "border-gray-700 bg-gray-900 hover:border-gray-600 hover:bg-gray-800"
            }`}
          >
            <span className="text-2xl leading-none">{s.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-black ${isSelected ? c.text : "text-white"}`}>
                {s.label}
              </p>
            </div>
            {isSelected && (
              <span className={`shrink-0 text-sm font-black ${c.text}`}>✓</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
