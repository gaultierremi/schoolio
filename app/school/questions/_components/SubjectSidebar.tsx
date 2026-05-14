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
 *
 *  1. Matière (subject_enum) — quelle discipline (Histoire, Maths, etc.)
 *  2. Thème (period) — chapitre/UAA/section du syllabus dont la question
 *     est tirée. Maïa remplit ce champ à la génération avec le nom du
 *     chapitre identifié dans le PDF.
 *
 * Les 2 filtres se combinent (AND). Permet de naviguer rapidement 1000
 * questions sur un syllabus de 300 pages → en cliquant matière puis
 * thème, on isole 30-50 questions à valider d'un coup.
 */
export function SubjectSidebar<T extends Question>({
  questions,
  selectedSubject,
  selectedTheme,
  onSelectSubject,
  onSelectTheme,
}: Props<T>) {
  // Questions filtrées par la matière sélectionnée (pour calculer les thèmes
  // visibles uniquement dans le scope courant)
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
    <aside className="w-full lg:w-60 shrink-0 space-y-6">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
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
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
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
              <p className="text-xs text-gray-600">+ {themeCounts.length - 30} thèmes (filtre matière pour réduire)</p>
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
          ? "bg-purple-500/15 text-purple-200 border border-purple-500/40"
          : "border border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200"
      }`}
    >
      <span className="truncate text-left">{label}</span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
          selected ? "bg-purple-500/30 text-purple-100" : "bg-gray-800 text-gray-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export type { SubjectId };
