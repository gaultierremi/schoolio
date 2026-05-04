"use client";

import { useState } from "react";
import Link from "next/link";
import type { QuizQuestion } from "@/lib/types";
import type { ConceptMastery } from "@/lib/concepts";
import { isCashCorrect, MODE_POINTS, MODE_LABELS } from "@/components/QuizCard";
import type { McqMode } from "@/components/QuizCard";

type AnswerRecord = {
  question: QuizQuestion;
  mode: McqMode | "truefalse";
  correct: boolean;
  pointsEarned: number;
  pointsPossible: number;
};

type ConceptProgress = {
  name: string;
  before: number;
  after: number;
};

function DifficultyStars({ level }: { level: number }) {
  return (
    <span className="text-sm tracking-widest text-amber-500">
      {"★".repeat(level)}
      <span className="text-white/20">{"★".repeat(3 - level)}</span>
    </span>
  );
}

function MasteryBar({ score, thin }: { score: number; thin?: boolean }) {
  const color =
    score < 30 ? "bg-red-500" : score < 60 ? "bg-orange-500" : "bg-green-500";
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-gray-700 ${thin ? "h-1.5" : "h-2"}`}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

function ModeSelector({ onSelect }: { onSelect: (mode: McqMode) => void }) {
  const modes: { id: McqMode; label: string; pts: number; desc: string }[] = [
    { id: "cash", label: "Cash", pts: 300, desc: "Réponse libre" },
    { id: "carre", label: "Carré", pts: 200, desc: "4 choix" },
    { id: "duo", label: "Duo", pts: 100, desc: "2 choix" },
  ];
  return (
    <div className="space-y-3">
      <p className="text-center text-xs uppercase tracking-widest text-gray-500">
        Choisis ton mode
      </p>
      <div className="grid grid-cols-3 gap-2">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            className="flex flex-col items-center gap-1 rounded-xl border border-gray-700 bg-gray-900 px-3 py-4 transition-all hover:border-purple-500/50 hover:bg-gray-800 active:scale-95"
          >
            <span className="text-base font-bold text-white">{m.label}</span>
            <span className="text-sm font-semibold text-purple-400">+{m.pts}</span>
            <span className="text-xs text-gray-500">{m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConceptPanel({
  concepts,
  masteryState,
  isCorrect,
}: {
  concepts: { id: string; name: string }[];
  masteryState: Record<string, number>;
  isCorrect: boolean;
}) {
  if (concepts.length === 0) return null;

  const message = isCorrect
    ? "Tu progresses sur ce concept !"
    : "Ce concept nécessite encore du travail.";

  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
      <p className="mb-3 text-xs font-black uppercase tracking-widest text-purple-400">
        Concepts associés
      </p>
      <div className="flex flex-col gap-3">
        {concepts.map((c) => {
          const score = masteryState[c.id] ?? 0;
          return (
            <div key={c.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-300">{c.name}</span>
                <span
                  className={`text-xs font-bold ${
                    score < 30
                      ? "text-red-400"
                      : score < 60
                        ? "text-orange-400"
                        : "text-green-400"
                  }`}
                >
                  {score}/100
                </span>
              </div>
              <MasteryBar score={score} thin />
            </div>
          );
        })}
      </div>
      <p
        className={`mt-3 text-xs font-semibold ${
          isCorrect ? "text-green-400" : "text-orange-400"
        }`}
      >
        {message}
      </p>
    </div>
  );
}

function TrainingResults({
  answers,
  conceptsWorked,
  weakConcepts,
  onContinue,
}: {
  answers: AnswerRecord[];
  conceptsWorked: Record<string, ConceptProgress>;
  weakConcepts: ConceptMastery[];
  onContinue: () => void;
}) {
  const score = answers.reduce((s, a) => s + a.pointsEarned, 0);
  const maxScore = answers.reduce((s, a) => s + a.pointsPossible, 0);
  const correctCount = answers.filter((a) => a.correct).length;

  const workedList = Object.entries(conceptsWorked)
    .map(([, data]) => data)
    .sort((a, b) => a.after - b.after);

  const toReview = workedList.filter((c) => c.after < 60).slice(0, 3);

  return (
    <div className="flex flex-col gap-6 py-8">
      {/* Score */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-center">
        <p className="text-xs uppercase tracking-widest text-gray-500">
          Score de la session
        </p>
        <p className="mt-2 text-5xl font-black text-white">
          {score}
          <span className="text-2xl text-gray-600"> / {maxScore}</span>
        </p>
        <p className="mt-1 text-sm text-purple-400">
          {correctCount} bonne{correctCount > 1 ? "s" : ""} réponse
          {correctCount > 1 ? "s" : ""} sur {answers.length}
        </p>
      </div>

      {/* Concepts progression */}
      {workedList.length > 0 && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-gray-400">
            Concepts travaillés
          </h3>
          <div className="flex flex-col gap-4">
            {workedList.map((c) => {
              const delta = c.after - c.before;
              return (
                <div key={c.name} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-300">
                      {c.name}
                    </span>
                    <span
                      className={`text-xs font-black ${
                        delta > 0
                          ? "text-green-400"
                          : delta < 0
                            ? "text-red-400"
                            : "text-gray-500"
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta === 0 ? "±0" : delta}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-right text-xs text-gray-600">
                      {c.before}
                    </span>
                    <MasteryBar score={c.after} />
                    <span className="w-6 text-xs font-bold text-gray-300">
                      {c.after}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top 3 to review */}
      {toReview.length > 0 && (
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-5">
          <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-orange-400">
            ↑ Priorité révision
          </h3>
          <ul className="flex flex-col gap-2">
            {toReview.map((c) => (
              <li key={c.name} className="flex items-center justify-between">
                <span className="text-sm text-gray-300">{c.name}</span>
                <span className="text-xs font-bold text-orange-400">
                  {c.after}/100
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Buttons */}
      <div className="flex flex-col gap-3 pb-8">
        <button
          type="button"
          onClick={onContinue}
          className="w-full rounded-xl bg-purple-600 py-4 font-black text-white transition hover:bg-purple-500 active:scale-[0.98]"
        >
          Continuer l&apos;entraînement →
        </button>
        <Link
          href="/profile"
          className="block w-full rounded-xl border border-gray-700 py-3 text-center text-sm font-bold text-gray-400 transition hover:border-gray-500 hover:text-white"
        >
          Voir mes progrès
        </Link>
      </div>
    </div>
  );
}

export default function TrainingCard({
  questions,
  weakConcepts,
  questionConcepts,
  initialMastery,
}: {
  questions: QuizQuestion[];
  weakConcepts: ConceptMastery[];
  questionConcepts: Record<string, { id: string; name: string }[]>;
  initialMastery: Record<string, number>;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [mode, setMode] = useState<McqMode | null>(null);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [cashInput, setCashInput] = useState("");
  const [duoIndices, setDuoIndices] = useState<[number, number] | null>(null);
  const [masteryState, setMasteryState] = useState<Record<string, number>>(
    initialMastery
  );
  const [conceptsWorked, setConceptsWorked] = useState<
    Record<string, ConceptProgress>
  >({});

  const total = questions.length;

  if (total === 0) {
    return (
      <div className="py-16 text-center text-gray-500">
        Aucune question disponible. Joue d&apos;abord au Quiz.
      </div>
    );
  }

  const sessionDone = answers.length === total;

  if (sessionDone) {
    return (
      <TrainingResults
        answers={answers}
        conceptsWorked={conceptsWorked}
        weakConcepts={weakConcepts}
        onContinue={() => window.location.reload()}
      />
    );
  }

  const question = questions[step];
  const isTrueFalse = question.type === "truefalse";
  const effectiveMode: McqMode | "truefalse" = isTrueFalse
    ? "truefalse"
    : mode ?? "carre";
  const pointsPossible = MODE_POINTS[effectiveMode];
  const currentConcepts = questionConcepts[question.id] ?? [];

  function resetQuestion() {
    setMode(null);
    setAnswered(false);
    setIsCorrect(false);
    setSelectedIndex(null);
    setCashInput("");
    setDuoIndices(null);
  }

  function applyMasteryUpdate(correct: boolean) {
    const newMastery = { ...masteryState };
    const newWorked = { ...conceptsWorked };
    for (const c of currentConcepts) {
      const before = newWorked[c.id]?.before ?? (masteryState[c.id] ?? 0);
      const current = masteryState[c.id] ?? 0;
      const after = correct
        ? Math.min(100, current + 5)
        : Math.max(0, current - 8);
      newMastery[c.id] = after;
      newWorked[c.id] = { name: c.name, before, after };
    }
    setMasteryState(newMastery);
    setConceptsWorked(newWorked);
  }

  function handleSelectMode(selectedMode: McqMode) {
    setMode(selectedMode);
    if (selectedMode === "duo") {
      const wrongs = question.options
        .map((_, i) => i)
        .filter((i) => i !== question.answer_index);
      const wrong = wrongs[Math.floor(Math.random() * wrongs.length)];
      const pair: [number, number] =
        Math.random() > 0.5
          ? [question.answer_index, wrong]
          : [wrong, question.answer_index];
      setDuoIndices(pair);
    }
  }

  function handleClickOption(index: number) {
    if (answered) return;
    const correct = index === question.answer_index;
    setSelectedIndex(index);
    setIsCorrect(correct);
    setAnswered(true);
    applyMasteryUpdate(correct);
  }

  function handleCashSubmit() {
    if (!cashInput.trim() || answered) return;
    const correct = isCashCorrect(
      cashInput,
      question.options[question.answer_index]
    );
    setIsCorrect(correct);
    setAnswered(true);
    applyMasteryUpdate(correct);
  }

  function handleNext() {
    if (typeof window !== "undefined") {
      fetch("/api/record-quiz-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          questionType: "quiz",
          correct: isCorrect,
          period: question.period ?? "",
          question: question.question,
        }),
      }).catch(() => {});
    }

    const newAnswers = [
      ...answers,
      {
        question,
        mode: effectiveMode,
        correct: isCorrect,
        pointsEarned: isCorrect ? pointsPossible : 0,
        pointsPossible,
      },
    ];
    setAnswers(newAnswers);

    if (step < total - 1) {
      setStep((s) => s + 1);
      resetQuestion();
    }
    // If last step, answers.length === total triggers sessionDone on next render
  }

  const displayIndices: number[] = isTrueFalse
    ? [0, 1]
    : mode === "duo"
      ? duoIndices ?? []
      : mode === "carre"
        ? question.options.map((_, i) => i)
        : [];

  const isTwoCol = isTrueFalse || mode === "duo";

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
          <DifficultyStars level={question.difficulty} />
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
        {(mode !== null || isTrueFalse) && (
          <p className="mt-2 text-xs text-gray-500">
            Mode {MODE_LABELS[effectiveMode]} · {pointsPossible} pts possibles
          </p>
        )}
      </div>

      {/* Mode selector */}
      {!isTrueFalse && mode === null && !answered && (
        <ModeSelector onSelect={handleSelectMode} />
      )}

      {/* Answer input */}
      {(isTrueFalse || mode !== null) &&
        !answered &&
        (mode === "cash" ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={cashInput}
              onChange={(e) => setCashInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCashSubmit()}
              placeholder="Votre réponse…"
              autoFocus
              className="flex-1 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCashSubmit}
              disabled={!cashInput.trim()}
              className="shrink-0 rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Valider
            </button>
          </div>
        ) : (
          <div
            className={`grid gap-3 ${
              isTwoCol ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"
            }`}
          >
            {displayIndices.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleClickOption(i)}
                className={`rounded-xl border border-gray-700 bg-gray-900 px-4 py-3.5 text-sm font-medium text-gray-200 transition-all hover:border-purple-500/50 hover:bg-gray-800 ${
                  isTwoCol ? "text-center" : "text-left"
                }`}
              >
                {!isTwoCol && (
                  <span className="mr-2 text-xs text-gray-500">
                    {String.fromCharCode(65 + i)}.
                  </span>
                )}
                {question.options[i]}
              </button>
            ))}
          </div>
        ))}

      {/* Feedback panel */}
      {answered && (
        <div className="flex flex-col gap-3">
          {mode !== "cash" && (
            <div
              className={`grid gap-3 ${
                isTwoCol ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"
              }`}
            >
              {displayIndices.map((i) => {
                let cls =
                  "border-gray-800 bg-gray-900/40 text-gray-600 opacity-40";
                if (i === question.answer_index)
                  cls = "border-green-500 bg-green-500/10 text-green-300";
                else if (i === selectedIndex)
                  cls = "border-red-500 bg-red-500/10 text-red-300";
                return (
                  <div
                    key={i}
                    className={`rounded-xl border px-4 py-3.5 text-sm font-medium ${cls} ${
                      isTwoCol ? "text-center" : "text-left"
                    }`}
                  >
                    {!isTwoCol && (
                      <span className="mr-2 text-xs opacity-60">
                        {String.fromCharCode(65 + i)}.
                      </span>
                    )}
                    {question.options[i]}
                  </div>
                );
              })}
            </div>
          )}

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
                <p
                  className={`text-sm ${
                    isCorrect ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {isCorrect ? `+${pointsPossible} pts` : "+0 pt"}
                </p>
                {!isCorrect && (
                  <p className="mt-1 text-xs text-white/50">
                    Bonne réponse :{" "}
                    <span className="text-white/70">
                      {question.options[question.answer_index]}
                    </span>
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

          <ConceptPanel
            concepts={currentConcepts}
            masteryState={masteryState}
            isCorrect={isCorrect}
          />
        </div>
      )}
    </div>
  );
}
