"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckCircle2, CircleX, Sparkles, SkipForward, Loader2 } from "lucide-react";
import { MCQOptions } from "@/app/accueil/devoirs/[id]/quiz/_components/MCQOptions";
import { NumericInput } from "@/app/accueil/devoirs/[id]/quiz/_components/NumericInput";
import { ShortTextInput } from "@/app/accueil/devoirs/[id]/quiz/_components/ShortTextInput";

/**
 * Sprint 5 PR S5-4 — Composant client quiz Plan Maïa.
 *
 * Réutilise les sous-composants MCQOptions/NumericInput/ShortTextInput
 * de `/accueil/devoirs/[id]/quiz/_components/` (anti-duplication).
 *
 * Backlog dette tech : ces sous-composants devraient à terme être déplacés
 * vers `components/quiz/` partagé (mais hors scope cette PR, l'import direct
 * fonctionne).
 *
 * UX Plan Maïa (mémoire `project_plan_maia_daily`) :
 * - Pick-and-choose : skip n'importe quand sans pénalité
 * - Pas adaptatif au skip (le plan reste équilibré)
 * - Compteur progression visible
 *
 * Différences vs quiz devoirs :
 * - Pas de "finish-quiz" endpoint, le trigger DB increment completed_count auto
 * - Skip = juste passer à la question suivante (pas d'insert)
 * - À la fin (toutes répondues OU toutes skip) → redirige vers overview du plan
 *
 * A11y :
 * - aria-live="polite" sur compteur progression
 * - role="alert" sur erreurs
 * - focus-visible AA, motion-reduce
 */

type Question = {
  id: string;
  type: string;
  question: string;
  options: string[] | null;
  unit: string | null;
  difficulty_stars: 1 | 2 | 3 | null;
};

type Verdict = { is_correct: boolean } | null;

export default function PlanMaiaQuizClient({
  planId,
  questions,
  alreadyAnsweredIds,
}: {
  planId: string;
  questions: Question[];
  alreadyAnsweredIds: string[];
}) {
  const router = useRouter();

  // Démarre sur la première non-répondue
  const initialIndex = useMemo(() => {
    const idx = questions.findIndex((q) => !alreadyAnsweredIds.includes(q.id));
    return idx === -1 ? 0 : idx;
  }, [questions, alreadyAnsweredIds]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [grading, setGrading] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [selectedMcqIdx, setSelectedMcqIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set des IDs répondus pendant cette session (pour ne pas re-grader)
  const [answeredInSession, setAnsweredInSession] = useState<Set<string>>(
    new Set(alreadyAnsweredIds),
  );

  const total = questions.length;
  const currentQuestion = questions[currentIndex];
  const remainingCount = total - answeredInSession.size;

  async function handleAnswer(studentAnswer: string | number) {
    if (!currentQuestion || grading) return;
    setGrading(true);
    setError(null);
    try {
      const res = await fetch("/api/student/plan-maia/check-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          question_id: currentQuestion.id,
          student_answer: studentAnswer,
        }),
      });
      const json = (await res.json()) as
        | { is_correct: boolean }
        | { error: string };
      if (!res.ok || !("is_correct" in json)) {
        setError("error" in json ? json.error : "Erreur de validation");
        return;
      }
      setVerdict({ is_correct: json.is_correct });
      setAnsweredInSession((prev) => {
        const next = new Set(prev);
        next.add(currentQuestion.id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setGrading(false);
    }
  }

  function handleNext() {
    setVerdict(null);
    setSelectedMcqIdx(null);
    setError(null);
    // Chercher la prochaine question non répondue
    const nextIdx = questions.findIndex(
      (q, i) => i > currentIndex && !answeredInSession.has(q.id),
    );
    if (nextIdx === -1) {
      // Toutes répondues → overview du plan
      router.push("/accueil/plan-maia/today");
    } else {
      setCurrentIndex(nextIdx);
    }
  }

  function handleSkip() {
    // Pick-and-choose : pas d'insert, juste passer à la suivante
    // Pas adaptatif (mémoire `project_plan_maia_daily`)
    setVerdict(null);
    setSelectedMcqIdx(null);
    setError(null);
    const nextIdx = questions.findIndex(
      (q, i) => i > currentIndex && !answeredInSession.has(q.id),
    );
    if (nextIdx === -1) {
      // Reviens en début sur les non-répondues, sinon overview
      const firstUnanswered = questions.findIndex(
        (q) => !answeredInSession.has(q.id),
      );
      if (firstUnanswered === -1 || firstUnanswered === currentIndex) {
        router.push("/accueil/plan-maia/today");
      } else {
        setCurrentIndex(firstUnanswered);
      }
    } else {
      setCurrentIndex(nextIdx);
    }
  }

  if (!currentQuestion) {
    return (
      <section role="status" className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Aucune question disponible. <a href="/accueil/plan-maia/today" className="underline">Retour au plan.</a>
        </p>
      </section>
    );
  }

  const progress = Math.round((answeredInSession.size / total) * 100);

  return (
    <>
      <header className="mb-4 flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"
        >
          <Sparkles size={18} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
            Quiz Plan Maïa
          </p>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Question {currentIndex + 1} sur {total}
          </h1>
        </div>
      </header>

      {/* Progress bar */}
      <div
        aria-live="polite"
        className="mb-6 rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <div
          className="h-2 rounded-full bg-indigo-500 transition-all motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${answeredInSession.size} questions répondues sur ${total}`}
        />
      </div>

      {/* Question */}
      <section
        aria-labelledby="question-title"
        className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2
          id="question-title"
          className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          {currentQuestion.question}
        </h2>
        {currentQuestion.difficulty_stars ? (
          <p
            aria-label={`Difficulté ${currentQuestion.difficulty_stars} sur 3`}
            className="mb-3 text-sm text-yellow-500"
          >
            {"★".repeat(currentQuestion.difficulty_stars)}
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
              {"★".repeat(3 - currentQuestion.difficulty_stars)}
            </span>
          </p>
        ) : null}

        {/* Inputs réutilisés des sous-composants quiz devoirs.
            Anti-leak : on passe answerIndex=null pour ne pas révéler la bonne
            réponse (cohérent avec le pattern check-answer générique).
            La révélation détaillée arrivera sur le bilan post-plan. */}
        {currentQuestion.type === "mcq" && currentQuestion.options ? (
          <MCQOptions
            options={currentQuestion.options}
            answered={verdict !== null}
            grading={grading}
            selected={selectedMcqIdx}
            answerIndex={null}
            wrongPhase={
              verdict === null ? null : verdict.is_correct ? null : "choosing"
            }
            onSelect={(idx: number) => {
              setSelectedMcqIdx(idx);
              void handleAnswer(idx);
            }}
          />
        ) : currentQuestion.type === "numeric" ? (
          <NumericInput
            answered={verdict !== null}
            grading={grading}
            unit={currentQuestion.unit}
            onSubmit={(value: number) => handleAnswer(value)}
          />
        ) : currentQuestion.type === "short_text" ? (
          <ShortTextInput
            answered={verdict !== null}
            grading={grading}
            onSubmit={(value: string) => handleAnswer(value)}
          />
        ) : (
          <p className="rounded bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Type de question non supporté pour l&apos;instant : {currentQuestion.type}
          </p>
        )}
      </section>

      {/* Verdict */}
      {verdict !== null ? (
        <section
          role="status"
          className={`mb-4 flex items-center gap-3 rounded-2xl border p-4 ${
            verdict.is_correct
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
              : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
          }`}
        >
          {verdict.is_correct ? (
            <>
              <CheckCircle2
                size={20}
                strokeWidth={2}
                aria-hidden="true"
                className="text-emerald-700 dark:text-emerald-400"
              />
              <div>
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  Correct.
                </p>
                <p className="text-xs text-emerald-800 dark:text-emerald-300">
                  Bien joué — passons à la suivante.
                </p>
              </div>
            </>
          ) : (
            <>
              <CircleX
                size={20}
                strokeWidth={2}
                aria-hidden="true"
                className="text-red-700 dark:text-red-400"
              />
              <div>
                <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                  Pas tout à fait.
                </p>
                <p className="text-xs text-red-800 dark:text-red-300">
                  Pas grave. La revue détaillée arrivera dans ton bilan.
                </p>
              </div>
            </>
          )}
        </section>
      ) : null}

      {/* Error */}
      {error ? (
        <section
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </section>
      ) : null}

      {/* Actions */}
      <nav aria-label="Actions du quiz" className="flex flex-wrap items-center gap-3">
        {verdict !== null ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={grading}
            className="
              inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2
              text-sm font-semibold text-white transition
              hover:bg-indigo-700
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
              disabled:opacity-50
              dark:focus-visible:ring-offset-slate-950
              motion-reduce:transition-none
            "
          >
            {grading ? (
              <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="animate-spin" />
            ) : null}
            Suivante
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSkip}
            disabled={grading}
            className="
              inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2
              text-sm font-medium text-slate-700 transition
              hover:bg-slate-50
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
              disabled:opacity-50
              dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800
              dark:focus-visible:ring-offset-slate-950
              motion-reduce:transition-none
            "
          >
            <SkipForward size={14} strokeWidth={2} aria-hidden="true" />
            Passer celle-ci
          </button>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-500">
          {remainingCount} restante{remainingCount > 1 ? "s" : ""} · pick-and-choose,
          sans pénalité
        </p>
      </nav>
    </>
  );
}
