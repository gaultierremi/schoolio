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
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
          Bilan · Plan Maïa du {planDate}
        </p>
        <div className="mt-2 flex items-start gap-4">
          <div
            aria-hidden="true"
            className={`
              flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-bold
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
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {encouragement}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              <strong>{correctCount}</strong> bonnes réponses sur <strong>{uniqueAnswered}</strong>{" "}
              question{uniqueAnswered > 1 ? "s" : ""} répondue{uniqueAnswered > 1 ? "s" : ""}
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
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 id="kpi-title" className="sr-only">
          Indicateurs du Plan Maïa
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard
            icon={<Target size={16} strokeWidth={2} aria-hidden="true" />}
            label="Score"
            value={`${overallPct}%`}
            tone="indigo"
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
          className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-3 flex items-center gap-2">
            <Sparkles
              size={18}
              strokeWidth={2}
              aria-hidden="true"
              className="text-indigo-600 dark:text-indigo-400"
            />
            <h2
              id="concepts-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
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
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-950"
                >
                  <Link
                    href={`/accueil/concepts/${c.concept.id}`}
                    className="
                      min-w-0 flex-1 truncate text-sm font-medium text-slate-900
                      transition hover:underline focus-visible:underline
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                      focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
                      dark:text-slate-100
                      dark:focus-visible:ring-offset-slate-950
                      motion-reduce:transition-none
                    "
                  >
                    {c.concept.name}
                  </Link>
                  <span className="shrink-0 text-xs text-slate-500 dark:text-slate-500">
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
            inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2
            text-sm font-semibold text-white transition
            hover:bg-indigo-700
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          Retour à mon accueil
        </Link>
        {!isCompleted ? (
          <Link
            href="/accueil/plan-maia/today/quiz"
            className="
              inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white
              px-4 py-2 text-sm font-medium text-slate-700 transition
              hover:bg-slate-50
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
              dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800
              dark:focus-visible:ring-offset-slate-950
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
  tone: "indigo" | "emerald" | "amber" | "slate";
}) {
  const toneClasses: Record<typeof tone, string> = {
    indigo: "text-indigo-700 dark:text-indigo-400",
    emerald: "text-emerald-700 dark:text-emerald-400",
    amber: "text-amber-700 dark:text-amber-400",
    slate: "text-slate-700 dark:text-slate-300",
  };
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
      <div className={`mb-1 flex items-center gap-1.5 text-xs font-medium ${toneClasses[tone]}`}>
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}
