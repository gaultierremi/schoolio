"use client";

import { useState } from "react";
import Link from "next/link";
import type { QuizQuestion } from "@/lib/types";

type AnswerRecord = {
  correct: boolean;
};

export default function ReviewCard({
  questions,
}: {
  questions: QuizQuestion[];
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [nextReviewLabel, setNextReviewLabel] = useState<string | null>(null);
  const [questionStartTime] = useState(() => Date.now());
  const [currentStartTime, setCurrentStartTime] = useState(Date.now());

  const total = questions.length;
  const sessionDone = answers.length === total;

  if (total === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-4xl">✅</p>
        <p className="mt-4 font-bold text-white">Aucune question à réviser</p>
        <p className="mt-1 text-sm text-gray-500">Tu es à jour !</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-purple-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-purple-500"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  if (sessionDone) {
    const correctCount = answers.filter((a) => a.correct).length;
    const tomorrow = new Date(Date.now() + 86_400_000);
    return (
      <div className="flex flex-col items-center gap-5 py-12 text-center">
        <p className="text-5xl">🎉</p>
        <div>
          <p className="text-2xl font-black text-white">
            Révision terminée !
          </p>
          <p className="mt-1 text-purple-400">
            {correctCount}/{total} correcte{correctCount > 1 ? "s" : ""}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-800 bg-gray-900 px-6 py-4 text-sm text-gray-400">
          <p>
            Tu as révisé{" "}
            <span className="font-bold text-white">{total}</span> question
            {total > 1 ? "s" : ""} aujourd&apos;hui.
          </p>
          <p className="mt-1">
            Prochain rendez-vous :{" "}
            <span className="font-bold text-white">
              demain à {tomorrow.getHours()}h
            </span>
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/study"
            className="rounded-xl border border-gray-700 px-5 py-3 text-sm font-bold text-gray-400 transition hover:text-white"
          >
            ← Créer une session
          </Link>
          <Link
            href="/study/stats"
            className="rounded-xl bg-purple-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-purple-500"
          >
            Voir mes progrès
          </Link>
        </div>
      </div>
    );
  }

  const question = questions[step];
  const isTrueFalse = question.type === "truefalse";
  const displayIndices = isTrueFalse
    ? [0, 1]
    : question.options.map((_, i) => i);

  function handleSelect(index: number) {
    if (answered) return;
    const correct = index === question.answer_index;
    const responseTime = Math.round((Date.now() - currentStartTime) / 1000);

    setSelectedIndex(index);
    setIsCorrect(correct);
    setAnswered(true);

    fetch("/api/spaced-repetition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: question.id,
        questionType: question.type,
        correct,
        responseTime,
      }),
    })
      .then((r) => r.json())
      .then((json: { nextReview?: string | null }) => {
        if (json.nextReview) {
          const date = new Date(json.nextReview);
          setNextReviewLabel(
            `Prochaine révision : ${date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`
          );
        }
      })
      .catch(() => {});
  }

  function handleNext() {
    setAnswers((prev) => [...prev, { correct: isCorrect }]);
    if (step < total - 1) {
      setStep((s) => s + 1);
      setSelectedIndex(null);
      setIsCorrect(false);
      setAnswered(false);
      setNextReviewLabel(null);
      setCurrentStartTime(Date.now());
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 py-6">
      {/* Progress */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold text-white">
            Q{step + 1}
            <span className="font-normal text-white/40"> / {total}</span>
          </span>
          {question.period && (
            <span className="text-sm text-white/60">{question.period}</span>
          )}
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-purple-500 transition-all duration-500"
            style={{ width: `${(step / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 px-5 py-5">
        <p className="text-lg font-medium leading-snug text-white">
          {question.question}
        </p>
      </div>

      {/* Options */}
      {!answered ? (
        <div
          className={`grid gap-3 ${
            isTrueFalse ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"
          }`}
        >
          {displayIndices.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(i)}
              className={`rounded-xl border border-gray-700 bg-gray-900 px-4 py-3.5 text-sm font-medium text-gray-200 transition-all hover:border-purple-500/50 hover:bg-gray-800 ${
                isTrueFalse ? "text-center" : "text-left"
              }`}
            >
              {!isTrueFalse && (
                <span className="mr-2 text-xs text-gray-500">
                  {String.fromCharCode(65 + i)}.
                </span>
              )}
              {question.options[i]}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Answered options */}
          <div
            className={`grid gap-3 ${
              isTrueFalse ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"
            }`}
          >
            {displayIndices.map((i) => {
              let cls = "border-gray-800 bg-gray-900/40 text-gray-600 opacity-40";
              if (i === question.answer_index)
                cls = "border-green-500 bg-green-500/10 text-green-300";
              else if (i === selectedIndex)
                cls = "border-red-500 bg-red-500/10 text-red-300";
              return (
                <div
                  key={i}
                  className={`rounded-xl border px-4 py-3.5 text-sm font-medium ${cls} ${
                    isTrueFalse ? "text-center" : "text-left"
                  }`}
                >
                  {!isTrueFalse && (
                    <span className="mr-2 text-xs opacity-60">
                      {String.fromCharCode(65 + i)}.
                    </span>
                  )}
                  {question.options[i]}
                </div>
              );
            })}
          </div>

          {/* Feedback */}
          <div
            className={`rounded-xl border p-4 ${
              isCorrect
                ? "border-green-800 bg-green-950/40"
                : "border-red-900 bg-red-950/40"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  className={`text-base font-bold ${
                    isCorrect ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {isCorrect ? "Correct !" : "Pas tout à fait…"}
                </p>
                {!isCorrect && (
                  <p className="mt-1 text-xs text-white/50">
                    Bonne réponse :{" "}
                    <span className="text-white/70">
                      {question.options[question.answer_index]}
                    </span>
                  </p>
                )}
                {nextReviewLabel && (
                  <p className="mt-1 text-xs text-purple-400">
                    {nextReviewLabel}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleNext}
                className="shrink-0 rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
              >
                {step < total - 1 ? "Suivante →" : "Résultats →"}
              </button>
            </div>
            {question.explanation && (
              <p className="mt-3 border-t border-white/10 pt-3 text-sm leading-relaxed text-white/70">
                {question.explanation}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
