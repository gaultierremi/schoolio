"use client";

import Link from "next/link";
import { CheckCircle2, Eye, Sparkles, Target } from "lucide-react";
import { masteryCellClass, masteryLabel, masteryLevel } from "@/lib/heatmap-mastery";

/**
 * Sprint 6 PR S6-6 — Composant client bilan Plan Maïa quotidien.
 *
 * Pattern hérité de S5-3 AssignmentBilanClient (adapté Plan Maïa).
 * Ton adulte bienveillant, pas infantilisant.
 */

type ByConcept = {
  concept: { id: string; name: string };
  total: number;
  answered: number;
  masteryPct: number;
};

export default function PlanMaiaBilanClient({
  planDate,
  isCompleted,
  completedAt,
  overallPct,
  correctCount,
  uniqueAnswered,
  totalQuestions,
  solutionViews,
  explanationViews,
  byConcept,
}: {
  planDate: string;
  isCompleted: boolean;
  completedAt: string | null;
  overallPct: number;
  correctCount: number;
  uniqueAnswered: number;
  totalQuestions: number;
  solutionViews: number;
  explanationViews: number;
  byConcept: ByConcept[];
}) {
  const encouragement =
    overallPct >= 85
      ? "Excellent travail."
      : overallPct >= 60
        ? "Bien joué — tu progresses."
        : overallPct >= 30
          ? "C'est un début. Reviens dessus pour consolider."
          : "Pas évident. Reprends la théorie et réessaye.";

  const sortedConcepts = [...byConcept].sort((a, b) => {
    if (a.answered === 0 && b.answered > 0) return 1;
    if (b.answered === 0 && a.answered > 0) return -1;
    return a.masteryPct - b.masteryPct;
  });

  return (
    <>
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide accent-text">
          Bilan · Plan Maïa du {planDate}
        </p>
        <div className="mt-2 flex items-start gap-4">
          <div
            aria-hidden="true"
            className={`
              flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-semibold
              ${overallPct >= 85
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : overallPct >= 60
                  ? "bg-lime-100 text-lime-700 dark:bg-lime-950/40 dark:text-lime-300"
                  : overallPct >= 30
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"}
            `}
          >
            {overallPct}%
          </div>
          <div>
            <h1 className="serif text-2xl font-semibold tracking-tight text-[rgb(var(--ink))]">
              {encouragement}
            </h1>
            <p className="mt-1 text-sm text-[rgb(var(--ink-2))]">
              <strong className="text-[rgb(var(--ink))]">{correctCount}</strong> bonnes réponses sur{" "}
              <strong className="text-[rgb(var(--ink))]">{uniqueAnswered}</strong> question
              {uniqueAnswered > 1 ? "s" : ""} répondue{uniqueAnswered > 1 ? "s" : ""}
              {totalQuestions > uniqueAnswered ? <> ({totalQuestions} au total)</> : null}
              {isCompleted && completedAt ? (
                <>
                  {" "}— terminé le{" "}
                  {new Date(completedAt).toLocaleDateString("fr-BE", {
                    day: "numeric",
                    month: "short",
                  })}
                </>
              ) : null}
            </p>
          </div>
        </div>
      </header>

      <section
        aria-labelledby="kpi-title"
        className="mb-6 card p-5"
      >
        <h2 id="kpi-title" className="sr-only">
          Indicateurs du Plan Maïa
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard
            icon={<Target size={16} strokeWidth={2} aria-hidden="true" />}
            label="Score"
            value={`${overallPct}%`}
            tone="accent"
          />
          <KpiCard
            icon={<CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />}
            label="Bonnes"
            value={`${correctCount}/${uniqueAnswered}`}
            tone="emerald"
          />
          <KpiCard
            icon={<Eye size={16} strokeWidth={2} aria-hidden="true" />}
            label="Solution/explication"
            value={`${solutionViews + explanationViews}`}
            tone="amber"
          />
        </div>
      </section>

      {sortedConcepts.length > 0 ? (
        <section
          aria-labelledby="concepts-title"
          className="mb-6 card p-6"
        >
          <div className="mb-3 flex items-center gap-2">
            <Sparkles
              size={18}
              strokeWidth={2}
              aria-hidden="true"
              className="accent-text"
            />
            <h2
              id="concepts-title"
              className="serif text-base font-semibold text-[rgb(var(--ink))]"
            >
              Concepts touchés aujourd&apos;hui
            </h2>
          </div>
          <ul role="list" className="space-y-2">
            {sortedConcepts.map((c) => {
              const level = masteryLevel(c.masteryPct);
              return (
                <li
                  key={c.concept.id}
                  className="flex items-center justify-between gap-3 rounded-xl surface-2-bg p-3"
                >
                  <Link
                    href={`/accueil/concepts/${c.concept.id}`}
                    className="
                      min-w-0 flex-1 truncate text-sm font-medium text-[rgb(var(--ink))]
                      transition hover:underline focus-visible:underline
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))]
                      focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface))]
                      motion-reduce:transition-none
                    "
                  >
                    {c.concept.name}
                  </Link>
                  <span className="shrink-0 text-xs text-[rgb(var(--ink-3))]">
                    {c.answered}/{c.total}
                  </span>
                  <span
                    aria-label={`Maîtrise ${c.masteryPct}% — ${masteryLabel(level)}`}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${masteryCellClass(level)}`}
                  >
                    {c.answered === 0 ? "—" : `${c.masteryPct}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <nav aria-label="Actions" className="flex flex-wrap gap-3">
        <Link
          href="/accueil"
          className="
            btn-primary inline-flex items-center justify-center rounded-xl px-4 py-2
            text-sm font-semibold
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))]
            focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface))]
            motion-reduce:transition-none
          "
        >
          Retour à mon accueil
        </Link>
        {!isCompleted ? (
          <Link
            href="/accueil/plan-maia/today/quiz"
            className="
              btn-secondary inline-flex items-center justify-center rounded-xl px-4 py-2
              text-sm font-medium
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))]
              focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface))]
              motion-reduce:transition-none
            "
          >
            Continuer mon plan
          </Link>
        ) : null}
      </nav>
    </>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "accent" | "emerald" | "amber" | "slate";
}) {
  const toneClasses: Record<typeof tone, string> = {
    accent: "accent-text",
    emerald: "text-emerald-700 dark:text-emerald-400",
    amber: "text-amber-700 dark:text-amber-400",
    slate: "text-slate-700 dark:text-slate-300",
  };
  return (
    <div className="rounded-xl surface-2-bg p-4">
      <div className={`mb-1 flex items-center gap-1.5 text-xs font-medium ${toneClasses[tone]}`}>
        {icon}
        {label}
      </div>
      <p className="text-xl font-semibold text-[rgb(var(--ink))]">{value}</p>
    </div>
  );
}
