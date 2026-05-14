"use client";

import { useMemo } from "react";
import { SUBJECTS, type SubjectId } from "@/lib/subjects";

type Question = {
  subject_enum?: string | null;
  subject?: string | null;
  period?: string | null;
};

type Props<T extends Question> = {
  questions: T[];
  selectedSubject: string | null;
  selectedTheme: string | null;
  onSelectSubject: (subject: string | null) => void;
  onSelectTheme: (theme: string | null) => void;
};

/**
 * Menu latéral gauche : deux niveaux de filtrage indépendants.
 */
export function SubjectSidebar<T extends Question>({
  questions,
  selectedSubject,
  selectedTheme,
  onSelectSubject,
  onSelectTheme,
}: Props<T>) {
  const matiereFilteredQuestions = useMemo(() => {
    if (selectedSubject === null) return questions;
    return questions.filter(
      (q) => ((q.subject_enum ?? q.subject ?? "autre") as string) === selectedSubject,
    );
  }, [questions, selectedSubject]);

  const subjectCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of questions) {
      const s = (q.subject_enum ?? q.subject ?? "autre") as string;
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([id, count]) => {
        const meta = SUBJECTS.find((s) => s.id === id);
        return { id, label: meta?.label ?? id, count };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [questions]);

  const themeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of matiereFilteredQuestions) {
      const t = (q.period ?? "").trim();
      if (t.length === 0) continue;
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [matiereFilteredQuestions]);

  const total = questions.length;
  const totalInMatiere = matiereFilteredQuestions.length;

  return (
    <aside className="w-full shrink-0 space-y-6 lg:w-60">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[rgb(var(--ink-3))]">
          Matière
        </p>
        <div className="flex flex-row flex-wrap gap-2 lg:flex-col lg:flex-nowrap">
          <SidebarButton
            label="Toutes"
            count={total}
            selected={selectedSubject === null}
            onClick={() => onSelectSubject(null)}
          />
          {subjectCounts.map((c) => (
            <SidebarButton
              key={c.id}
              label={c.label}
              count={c.count}
              selected={selectedSubject === c.id}
              onClick={() => onSelectSubject(c.id === selectedSubject ? null : c.id)}
            />
          ))}
        </div>
      </div>

      {themeCounts.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[rgb(var(--ink-3))]">
            Thème / chapitre
          </p>
          <div className="flex flex-row flex-wrap gap-2 lg:flex-col lg:flex-nowrap">
            <SidebarButton
              label="Tous"
              count={totalInMatiere}
              selected={selectedTheme === null}
              onClick={() => onSelectTheme(null)}
            />
            {themeCounts.slice(0, 30).map((t) => (
              <SidebarButton
                key={t.label}
                label={t.label}
                count={t.count}
                selected={selectedTheme === t.label}
                onClick={() => onSelectTheme(t.label === selectedTheme ? null : t.label)}
              />
            ))}
            {themeCounts.length > 30 && (
              <p className="text-xs text-[rgb(var(--ink-3))]">+ {themeCounts.length - 30} thèmes (filtre matière pour réduire)</p>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function SidebarButton({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
        selected
          ? "border border-[rgb(var(--accent))]/40 bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]"
          : "border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
      }`}
    >
      <span className="truncate text-left">{label}</span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
          selected ? "bg-[rgb(var(--accent))]/20 text-[rgb(var(--accent))]" : "bg-[rgb(var(--surface-3))] text-[rgb(var(--ink-3))]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export type { SubjectId };
