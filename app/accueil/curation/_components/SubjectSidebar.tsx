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
export type QuestionType = "mcq" | "numeric" | "short_text";

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "QCM",
  numeric: "Numérique",
  short_text: "Réponse libre",
};

const ALL_TYPES: QuestionType[] = ["mcq", "numeric", "short_text"];

type Props<T extends Question> = {
  questions: T[];
  selectedSubject: string | null;
  selectedTheme: string | null;
  selectedTypes?: Set<QuestionType>;
  onSelectSubject: (subject: string | null) => void;
  onSelectTheme: (theme: string | null) => void;
  onSelectTypes?: (types: Set<QuestionType>) => void;
};

function normalizeType(raw: unknown): QuestionType | null {
  if (raw === "mcq" || raw === "truefalse") return "mcq";
  if (raw === "numeric") return "numeric";
  if (raw === "short_text") return "short_text";
  return null;
}

/**
 * Menu latéral gauche : trois niveaux de filtrage indépendants.
 * - Matière (subject_enum) — single-select
 * - Thème / chapitre (period) — single-select
 * - Type de question (mcq / numeric / short_text) — multi-select checkbox
 *
 * Pour le filtre type, le Set vide = "Tous" implicite (aucun filtre actif).
 * Cliquer "Tous" vide le Set ; cocher un type l'ajoute au Set.
 */
export function SubjectSidebar<T extends Question>({
  questions,
  selectedSubject,
  selectedTheme,
  selectedTypes,
  onSelectSubject,
  onSelectTheme,
  onSelectTypes,
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
    const m: Record<QuestionType, number> = {
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
  const noTypeSelected = !selectedTypes || selectedTypes.size === 0;

  function toggleType(type: QuestionType) {
    if (!onSelectTypes) return;
    const next = new Set(selectedTypes ?? []);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    onSelectTypes(next);
  }

  return (
    <aside className="w-full shrink-0 space-y-6 lg:w-80">
      {onSelectTypes && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[rgb(var(--ink-3))]">
            Type
          </p>
          <div className="flex flex-row flex-wrap gap-2 lg:flex-col lg:flex-nowrap">
            <SidebarButton
              label="Tous"
              count={typeCounts.all}
              selected={noTypeSelected}
              onClick={() => onSelectTypes(new Set())}
            />
            {ALL_TYPES.map((t) => (
              <CheckboxButton
                key={t}
                label={TYPE_LABELS[t]}
                count={typeCounts[t]}
                checked={selectedTypes?.has(t) ?? false}
                onClick={() => toggleType(t)}
              />
            ))}
          </div>
        </div>
      )}

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

      {selectedSubject !== null && themeCounts.length > 0 && (
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
              <p className="text-xs text-[rgb(var(--ink-3))]">+ {themeCounts.length - 30} thèmes</p>
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

/**
 * Variante checkbox-style pour le filtre TYPE (multi-select).
 * Cocher = ajoute le type au Set des filtres actifs. Décocher = le retire.
 * Set vide = "Tous" (équivalent à aucun filtre).
 */
function CheckboxButton({
  label,
  count,
  checked,
  onClick,
}: {
  label: string;
  count: number;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
        checked
          ? "border border-[rgb(var(--accent))]/40 bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]"
          : "border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink))]"
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          checked
            ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]"
            : "border-[rgb(var(--ink-3))] bg-transparent"
        }`}
        aria-hidden="true"
      >
        {checked && (
          <svg
            viewBox="0 0 16 16"
            className="h-3 w-3 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 8 7 12 13 4" />
          </svg>
        )}
      </span>
      <span className="truncate flex-1 text-left">{label}</span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
          checked ? "bg-[rgb(var(--accent))]/20 text-[rgb(var(--accent))]" : "bg-[rgb(var(--surface-3))] text-[rgb(var(--ink-3))]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export type { SubjectId };
