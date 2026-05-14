"use client";

import { useMemo } from "react";
import { SUBJECTS, type SubjectId } from "@/lib/subjects";

type Question = { subject_enum?: string | null; subject?: string | null };

type Props<T extends Question> = {
  questions: T[];
  selected: string | null;
  onSelect: (subject: string | null) => void;
};

/**
 * Menu latéral gauche : liste des matières présentes dans le set de questions
 * + compteur. Clic = filtre. "Toutes" remet à null.
 *
 * Utile sur l'onglet "à valider" pour grouper visuellement les questions par
 * matière quand on a 100s ou 1000s de questions à parcourir (gros syllabus).
 */
export function SubjectSidebar<T extends Question>({ questions, selected, onSelect }: Props<T>) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of questions) {
      const s = (q.subject_enum ?? q.subject ?? "autre") as string;
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    // Sort by count desc, then by label asc.
    return Array.from(m.entries())
      .map(([id, count]) => {
        const meta = SUBJECTS.find((s) => s.id === id);
        return { id, label: meta?.label ?? id, count };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [questions]);

  const total = questions.length;

  return (
    <aside className="w-full lg:w-56 shrink-0">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Matière
      </p>
      <div className="flex flex-row flex-wrap gap-2 lg:flex-col lg:flex-nowrap">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-bold transition w-full ${
            selected === null
              ? "bg-purple-500/15 text-purple-200 border border-purple-500/40"
              : "border border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200"
          }`}
        >
          <span>Toutes</span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${selected === null ? "bg-purple-500/30 text-purple-100" : "bg-gray-800 text-gray-500"}`}>
            {total}
          </span>
        </button>

        {counts.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id === selected ? null : c.id)}
            className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-bold transition w-full ${
              selected === c.id
                ? "bg-purple-500/15 text-purple-200 border border-purple-500/40"
                : "border border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200"
            }`}
          >
            <span className="truncate text-left">{c.label}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${selected === c.id ? "bg-purple-500/30 text-purple-100" : "bg-gray-800 text-gray-500"}`}>
              {c.count}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

// Re-export for ergonomic import sites
export type { SubjectId };
