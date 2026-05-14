"use client";

import { useMemo } from "react";
import { SUBJECTS, type SubjectId } from "@/lib/subjects";

type Question = {
  subject_enum?: string | null;
  subject?: string | null;
  period?: string | null;
  type?: string | null;
};

// Types de question stockés en DB (cf. lib/generate-questions/extract-content.ts).
// "truefalse" est legacy mais on l'agrège dans "mcq" pour l'UI (un truefalse = un QCM 2 options).
export type QuestionTypeFilter = "all" | "mcq" | "numeric" | "short_text";

const TYPE_LABELS: Record<Exclude<QuestionTypeFilter, "all">, string> = {
  mcq: "QCM",
  numeric: "Numérique",
  short_text: "Réponse libre",
};

type Props<T extends Question> = {
  questions: T[];
  selectedSubject: string | null;
  selectedTheme: string | null;
  selectedType?: QuestionTypeFilter;
  onSelectSubject: (subject: string | null) => void;
  onSelectTheme: (theme: string | null) => void;
  onSelectType?: (type: QuestionTypeFilter) => void;
};

function normalizeType(raw: unknown): Exclude<QuestionTypeFilter, "all"> | null {
  if (raw === "mcq" || raw === "truefalse") return "mcq";
  if (raw === "numeric") return "numeric";
  if (raw === "short_text") return "short_text";
  return null;
}

/**
 * Menu latéral gauche : trois niveaux de filtrage indépendants.
 * - Matière (subject_enum)
 * - Thème / chapitre (period)
 * - Type de question (mcq / numeric / short_text)
 *
 * Largeur élargie (~320px) + wrap 2 lignes sur les chapitres pour gérer les
 * titres longs (ex: "Chapitre 14 – Conservation de la masse...").
 */
export function SubjectSidebar<T extends Question>({
  questions,
  selectedSubject,
  selectedTheme,
  selectedType = "all",
  onSelectSubject,
  onSelectTheme,
  onSelectType,
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

  // Counts par type, en respectant les filtres matière + thème déjà actifs.
  // (Pour que le prof voie combien de QCM il a DANS le chapitre sélectionné.)
  const typeCounts = useMemo(() => {
    const scope = matiereFilteredQuestions.filter((q) => {
      if (selectedTheme === null) return true;
      return (q.period ?? "").trim() === selectedTheme;
    });
    const m: Record<Exclude<QuestionTypeFilter, "all">, number> = {
      mcq: 0,
      numeric: 0,
      short_text: 0,
    };
    for (const q of scope) {
      const norm = normalizeType(q.type);
      if (norm) m[norm] += 1;
    }
    return { ...m, all: scope.length };
  }, [matiereFilteredQuestions, selectedTheme]);

  const total = questions.length;
  const totalInMatiere = matiereFilteredQuestions.length;

  return (
    <aside className="w-full shrink-0 space-y-6 lg:w-80">
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
                wrapLabel
              />
            ))}
            {themeCounts.length > 30 && (
              <p className="text-xs text-[rgb(var(--ink-3))]">+ {themeCounts.length - 30} thèmes (filtre matière pour réduire)</p>
            )}
          </div>
        </div>
      )}

      {onSelectType && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[rgb(var(--ink-3))]">
            Type
          </p>
          <div className="flex flex-row flex-wrap gap-2 lg:flex-col lg:flex-nowrap">
            <SidebarButton
              label="Tous"
              count={typeCounts.all}
              selected={selectedType === "all"}
              onClick={() => onSelectType("all")}
            />
            {(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map((t) => (
              <SidebarButton
                key={t}
                label={TYPE_LABELS[t]}
                count={typeCounts[t]}
                selected={selectedType === t}
                onClick={() => onSelectType(selectedType === t ? "all" : t)}
              />
            ))}
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
  wrapLabel = false,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
  wrapLabel?: boolean;
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
      <span
        className={
          wrapLabel
            ? "min-w-0 flex-1 text-left leading-tight line-clamp-2"
            : "truncate text-left"
        }
      >
        {label}
      </span>
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
