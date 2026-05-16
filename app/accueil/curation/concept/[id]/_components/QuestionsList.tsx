"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/Switch";
import type { QuestionRow } from "../types";

const TYPE_LABELS: Record<string, string> = {
  mcq: "QCM",
  truefalse: "Vrai/Faux",
  numeric: "Numérique",
  short_text: "Réponse courte",
  multi_step: "Multi-étapes",
};

/**
 * Liste des questions rattachées au concept (Sprint 2B PR B).
 *
 * UX :
 * - 1 row par question : type badge + énoncé tronqué + slider is_active
 * - Switch Radix avec optimistic update + rollback sur erreur
 * - Vide → empty state avec lien vers création
 *
 * A11y :
 * - `<ul>` sémantique avec `role="list"` pour préserver le role sous Tailwind reset
 * - Switch Radix : role=switch + aria-checked + label parlant
 * - `aria-busy` sur la row pendant le toggle
 */
export default function QuestionsList({
  questions,
  onToggle,
  onError,
}: {
  questions: QuestionRow[];
  onToggle: (questionId: string, nextActive: boolean) => void;
  onError: (message: string) => void;
}) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  if (questions.length === 0) {
    return (
      <div
        className="
          rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center
          dark:border-slate-700 dark:bg-slate-900
        "
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Aucune question liée à ce concept pour l&apos;instant.
        </p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
          Les questions générées par Maïa ou créées manuellement et taggées à ce concept
          apparaîtront ici.
        </p>
      </div>
    );
  }

  async function toggle(question: QuestionRow) {
    const next = !question.is_active;
    setPendingIds((prev) => new Set(prev).add(question.id));
    // Optimistic update upstream
    onToggle(question.id, next);
    try {
      const res = await fetch(`/api/curation/${question.id}/toggle-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        // Rollback
        onToggle(question.id, !next);
        onError(json.error ?? "Erreur lors du basculement");
      }
    } catch (err) {
      // Rollback
      onToggle(question.id, !next);
      onError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setPendingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(question.id);
        return copy;
      });
    }
  }

  return (
    <ul
      role="list"
      className="
        divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white
        dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900
      "
    >
      {questions.map((q) => {
        const isPending = pendingIds.has(q.id);
        const typeLabel = TYPE_LABELS[q.type] ?? q.type;
        return (
          <li key={q.id} aria-busy={isPending || undefined} className="flex items-start gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="
                    inline-flex shrink-0 items-center rounded-md
                    bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase
                    tracking-wide text-slate-700
                    dark:bg-slate-800 dark:text-slate-300
                  "
                >
                  {typeLabel}
                </span>
                {q.difficulty_stars ? (
                  <span
                    aria-label={`Difficulté ${q.difficulty_stars} sur 3`}
                    className="text-xs text-yellow-500"
                  >
                    {"★".repeat(q.difficulty_stars)}
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                      {"★".repeat(3 - q.difficulty_stars)}
                    </span>
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {q.question.length > 200 ? `${q.question.slice(0, 200)}…` : q.question}
              </p>
            </div>
            <div className="shrink-0">
              <Switch
                checked={q.is_active}
                onCheckedChange={() => toggle(q)}
                label={
                  q.is_active
                    ? `Désactiver la question ${q.question.slice(0, 40)}`
                    : `Activer la question ${q.question.slice(0, 40)}`
                }
                disabled={isPending}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
