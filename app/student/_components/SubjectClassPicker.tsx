"use client";

import { ChevronRight } from "lucide-react";
import type { SubjectClass } from "@/lib/types/student-dashboard";

type Props = {
  classes: SubjectClass[];
  selectedClassId: string;
  onSelect: (classId: string) => void;
};

const SUBJECT_COLORS: Record<string, { bg: string; text: string }> = {
  chimie:        { bg: "bg-[rgb(37_99_235)]/10", text: "text-[rgb(37_99_235)]" },
  physique:      { bg: "bg-[rgb(168_85_247)]/10", text: "text-[rgb(168_85_247)]" },
  biologie:      { bg: "bg-[rgb(34_197_94)]/10", text: "text-[rgb(34_197_94)]" },
  mathematiques: { bg: "bg-[rgb(245_158_11)]/10", text: "text-[rgb(245_158_11)]" },
  histoire:      { bg: "bg-[rgb(180_83_9)]/10", text: "text-[rgb(180_83_9)]" },
  geographie:    { bg: "bg-[rgb(14_165_233)]/10", text: "text-[rgb(14_165_233)]" },
  francais:      { bg: "bg-[rgb(244_63_94)]/10", text: "text-[rgb(244_63_94)]" },
  anglais:       { bg: "bg-[rgb(99_102_241)]/10", text: "text-[rgb(99_102_241)]" },
  neerlandais:   { bg: "bg-[rgb(20_184_166)]/10", text: "text-[rgb(20_184_166)]" },
};

function subjectColor(subject: string | null) {
  if (!subject) return { bg: "bg-[rgb(var(--surface-3))]", text: "text-[rgb(var(--ink-2))]" };
  return SUBJECT_COLORS[subject] ?? { bg: "bg-[rgb(var(--surface-3))]", text: "text-[rgb(var(--ink-2))]" };
}

export default function SubjectClassPicker({ classes, selectedClassId, onSelect }: Props) {
  if (classes.length <= 1) return null;

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-2 pb-1">
        {classes.map((c) => {
          const isSelected = c.class_id === selectedClassId;
          const color = subjectColor(c.subject);
          return (
            <button
              key={c.class_id}
              type="button"
              onClick={() => onSelect(c.class_id)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isSelected
                  ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-white"
                  : `border-[rgb(var(--border))] bg-[rgb(var(--surface))] ${color.text} hover:border-[rgb(var(--accent))]/50`
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isSelected ? "bg-white" : color.bg.replace("/10", "")
                }`}
                aria-hidden
              />
              <span>{c.class_name}</span>
              {c.parent_class_name && !isSelected && (
                <span className="text-[10px] text-[rgb(var(--ink-3))]">· {c.parent_class_name}</span>
              )}
              <ChevronRight className={`h-3 w-3 ${isSelected ? "text-white/70" : "text-[rgb(var(--ink-3))]"}`} aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { subjectColor };
