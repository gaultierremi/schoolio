"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  CircleHelp,
  CircleX,
  Lightbulb,
  Loader2,
  MinusCircle,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  masteryCellClass,
  masteryLabel,
  masteryLevel,
  statusLabel,
  type StatusKind,
} from "@/lib/heatmap-mastery";

/**
 * Sprint 5 PR S5-1 — Composant client drill-down élève × devoir.
 *
 * Affiche les réponses détaillées de l'élève, groupées par concept (cohérent
 * avec l'axe heatmap). Permet au prof de voir où l'élève a buté concept par
 * concept.
 *
 * Manchette résumé Maïa : placeholder (mémoire `project_drilldown_summary_maia`).
 * Quand le batch pré-baked sera livré, on lira `assignment_student_summaries`.
 * **Jamais** d'appel IA runtime ici (mémoire explicite).
 *
 * A11y :
 * - <section aria-labelledby> pour chaque concept (navigation lecteur écran)
 * - aria-current sur le concept ciblé via query `?concept=...` (depuis heatmap)
 * - badges correct/incorrect avec icône + texte (pas couleur seule)
 * - focus-visible ring AA, motion-reduce sur animations
 * - scroll-margin-top pour ancres fragment (pas masqué par sticky nav)
 *
 * `feedback_heatmap_no_overwhelm` : max 3-5 alertes visuelles simultanées,
 * pas surcharger l'élève. Ici prof, mais on garde le ton encourageant.
 */

type Question = {
  id: string;
  question: string;
  type: string;
  difficulty_stars: 1 | 2 | 3 | null;
  position: number;
  answer: {
    is_correct: boolean;
    requested_solution: boolean;
    requested_explanation: boolean;
    created_at: string;
  } | null;
};

type ConceptSection = {
  concept: { id: string; name: string; slug: string };
  masteryPct: number;
  questions: Question[];
};

type ApiResponse = {
  ok: true;
  student: {
    user_id: string;
    display_name: string;
    status: StatusKind;
    membership_status: string;
  };
  assignment: { id: string; title: string };
  byConcept: ConceptSection[];
  questionsWithoutConcept: Question[];
};

type ErrorResponse = { ok: false; error: string };

export default function EleveAssignmentDetail({
  classId,
  assignmentId,
  studentId,
}: {
  classId: string;
  assignmentId: string;
  studentId: string;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const targetConceptId = searchParams.get("concept");
  const targetSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/classes/${classId}/assignments/${assignmentId}/student/${studentId}`,
        );
        const json = (await res.json()) as ApiResponse | ErrorResponse;
        if (cancelled) return;
        if (!res.ok || !("ok" in json) || !json.ok) {
          setError("error" in json ? json.error : "Erreur de chargement");
          return;
        }
        setError(null);
        setData(json);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur réseau");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [classId, assignmentId, studentId]);

  // Scroll vers la section concept ciblée par la query (?concept=...)
  // D5 fix : respecte prefers-reduced-motion (scrollIntoView smooth ne le
  // respecte pas automatiquement, contrairement aux animations CSS).
  useEffect(() => {
    if (!data || !targetConceptId) return;
    const timer = window.setTimeout(() => {
      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      targetSectionRef.current?.scrollIntoView({
        behavior: prefersReduced ? "auto" : "smooth",
        block: "start",
      });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [data, targetConceptId]);

  const overall = useMemo(() => {
    if (!data) return null;
    const all = data.byConcept.flatMap((c) => c.questions);
    const answered = all.filter((q) => q.answer !== null);
    const correct = answered.filter((q) => q.answer?.is_correct).length;
    return {
      total: all.length,
      answered: answered.length,
      correct,
      pct: answered.length === 0 ? 0 : Math.round((100 * correct) / answered.length),
    };
  }, [data]);

  if (error) {
    return (
      <section
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      >
        <p className="font-semibold">Impossible de charger le détail.</p>
        <p className="mt-1 text-xs">{error}</p>
      </section>
    );
  }

  if (data === null) {
    return (
      <section
        aria-busy="true"
        className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center gap-3">
          <Loader2
            size={18}
            strokeWidth={2}
            aria-hidden="true"
            className="animate-spin text-indigo-500 motion-reduce:animate-none"
          />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Chargement du détail élève…
          </p>
        </div>
      </section>
    );
  }

  const status = statusLabel(data.student.status);
  const hasLeftClass = data.student.membership_status !== "active";

  return (
    <>
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
          Détail élève · {data.assignment.title}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {data.student.display_name}
          </h1>
          {hasLeftClass ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              aria-label="Cet élève n'est plus inscrit dans la classe — consultation historique uniquement"
            >
              A quitté la classe
            </span>
          ) : null}
        </div>
        <p className={`mt-1 text-sm font-medium ${status.toneClass}`}>{status.label}</p>
        {overall ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            <strong className="text-slate-900 dark:text-slate-100">
              {overall.correct}/{overall.answered}
            </strong>
            {" "}questions correctes sur {overall.total} total{" "}
            {overall.answered > 0 ? (
              <>
                · taux de réussite{" "}
                <strong className="text-slate-900 dark:text-slate-100">{overall.pct}%</strong>
              </>
            ) : null}
          </p>
        ) : null}
      </header>

      {/* Manchette résumé Maïa (placeholder, batch pré-baked à venir) */}
      <aside
        aria-labelledby="summary-title"
        className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 dark:border-indigo-900 dark:bg-indigo-950/30"
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"
          >
            <Sparkles size={18} strokeWidth={2} />
          </div>
          <div>
            <h2
              id="summary-title"
              className="text-sm font-semibold text-indigo-900 dark:text-indigo-200"
            >
              Résumé Maïa
            </h2>
            <p className="mt-1 text-sm text-indigo-800 dark:text-indigo-300">
              {data.byConcept.length === 0 ? (
                <>L&apos;élève n&apos;a pas encore de questions assignées.</>
              ) : overall && overall.answered === 0 ? (
                <>L&apos;élève n&apos;a pas encore commencé ce devoir.</>
              ) : (
                <>
                  Voir ci-dessous le détail par concept. Les résumés intelligents
                  arriveront prochainement (génération nocturne, jamais en direct).
                </>
              )}
            </p>
          </div>
        </div>
      </aside>

      {/* Sections par concept */}
      {data.byConcept.length === 0 && data.questionsWithoutConcept.length === 0 ? (
        <section
          role="status"
          className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
        >
          Pas de réponses encore enregistrées pour ce devoir.
        </section>
      ) : (
        <div className="space-y-4">
          {data.byConcept.map((section) => {
            const isTarget = targetConceptId === section.concept.id;
            const level = masteryLevel(section.masteryPct);
            return (
              <section
                key={section.concept.id}
                id={`concept-${section.concept.id}`}
                ref={isTarget ? targetSectionRef : undefined}
                aria-labelledby={`concept-title-${section.concept.id}`}
                aria-current={isTarget ? "location" : undefined}
                className={`
                  scroll-mt-20 rounded-2xl border bg-white p-5 dark:bg-slate-900
                  ${isTarget
                    ? "border-indigo-400 ring-2 ring-indigo-200 dark:border-indigo-600 dark:ring-indigo-900"
                    : "border-slate-200 dark:border-slate-800"}
                `}
              >
                <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2
                    id={`concept-title-${section.concept.id}`}
                    className="text-base font-semibold text-slate-900 dark:text-slate-100"
                  >
                    {section.concept.name}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span
                      aria-label={`Maîtrise ${section.masteryPct}% — ${masteryLabel(level)}`}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${masteryCellClass(level)}`}
                    >
                      {section.masteryPct}%
                    </span>
                    <ConceptTrendIcon pct={section.masteryPct} />
                  </div>
                </header>
                <QuestionList questions={section.questions} />
              </section>
            );
          })}

          {data.questionsWithoutConcept.length > 0 ? (
            <section
              aria-labelledby="no-concept-title"
              className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 dark:border-amber-900 dark:bg-amber-950/20"
            >
              <header className="mb-3 flex items-center gap-2">
                <Lightbulb
                  size={16}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="text-amber-700 dark:text-amber-400"
                />
                <h2
                  id="no-concept-title"
                  className="text-base font-semibold text-amber-900 dark:text-amber-200"
                >
                  Questions sans concept rattaché
                </h2>
              </header>
              <QuestionList questions={data.questionsWithoutConcept} />
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

/**
 * Icône tendance (purement décorative — l'info utile est dans le %).
 * Trois états : haut (>=70), bas (<40), neutre (40-69 ou 0 non évalué).
 */
function ConceptTrendIcon({ pct }: { pct: number }) {
  if (pct === 0) return null;
  if (pct >= 70) {
    return (
      <TrendingUp
        size={16}
        strokeWidth={2}
        aria-hidden="true"
        className="text-emerald-600 dark:text-emerald-400"
      />
    );
  }
  if (pct < 40) {
    return (
      <TrendingDown
        size={16}
        strokeWidth={2}
        aria-hidden="true"
        className="text-red-600 dark:text-red-400"
      />
    );
  }
  return null;
}

function QuestionList({ questions }: { questions: Question[] }) {
  if (questions.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-500">
        Aucune question dans cette section.
      </p>
    );
  }
  return (
    <ol role="list" className="space-y-2">
      {questions.map((q, i) => (
        <li
          key={q.id}
          className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950"
        >
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200"
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm text-slate-700 dark:text-slate-300">
              {q.question.slice(0, 200)}
              {q.question.length > 200 ? "…" : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <AnswerBadge answer={q.answer} />
              {q.difficulty_stars ? (
                <span
                  aria-label={`Difficulté ${q.difficulty_stars} sur 3`}
                  className="text-yellow-500"
                >
                  {"★".repeat(q.difficulty_stars)}
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                    {"★".repeat(3 - q.difficulty_stars)}
                  </span>
                </span>
              ) : null}
              <TypeBadge type={q.type} />
              {q.answer?.requested_solution ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  Solution consultée
                </span>
              ) : null}
              {q.answer?.requested_explanation ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  Explication consultée
                </span>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function AnswerBadge({ answer }: { answer: Question["answer"] }) {
  if (!answer) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        <MinusCircle size={12} strokeWidth={2} aria-hidden="true" />
        Non répondu
      </span>
    );
  }
  if (answer.is_correct) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircle2 size={12} strokeWidth={2} aria-hidden="true" />
        Correct
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-900 dark:bg-red-950/40 dark:text-red-300">
      <CircleX size={12} strokeWidth={2} aria-hidden="true" />
      Incorrect
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const label =
    type === "mcq"
      ? "QCM"
      : type === "numeric"
        ? "Numérique"
        : type === "short_text"
          ? "Réponse courte"
          : type;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-300">
      <CircleHelp size={10} strokeWidth={2} aria-hidden="true" />
      {label}
    </span>
  );
}
