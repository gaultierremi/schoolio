"use client";

import { useEffect, useState } from "react";
import type { QuizQuestion, QuizDifficulty } from "@/lib/types";
import { createClient } from "@/lib/supabase-browser";
import { saveQuizScore } from "@/lib/scores";

export type McqMode = "cash" | "carre" | "duo";

export const MODE_POINTS: Record<McqMode | "truefalse", number> = {
  cash: 300,
  carre: 200,
  duo: 100,
  truefalse: 150,
};

export const MODE_LABELS: Record<McqMode | "truefalse", string> = {
  cash: "Cash",
  carre: "Carré",
  duo: "Duo",
  truefalse: "Vrai / Faux",
};

type AnswerRecord = {
  question: QuizQuestion;
  mode: McqMode | "truefalse";
  playerAnswer: string;
  correct: boolean;
  pointsEarned: number;
  pointsPossible: number;
};

export function isCashCorrect(player: string, correct: string): boolean {
  const ABBREVS: [RegExp, string][] = [
    [/\bste\b/g, "sainte"],
    [/\bst\b/g, "saint"],
    [/\bdr\b/g, "docteur"],
    [/\bmr\b/g, "monsieur"],
    [/\bm\./g, "monsieur"],
    [/\bjc\b/g, "jesus christ"],
  ];

  function normalize(s: string): string {
    let r = s.toLowerCase().trim();
    r = r.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const [pat, rep] of ABBREVS) r = r.replace(pat, rep);
    r = r.replace(/[-–—]/g, " ");
    r = r.replace(/[^a-z0-9\s]/g, " ");
    r = r.replace(/\b(le|la|les|de|du|des|un|une|d|l)\b/g, " ");
    return r.replace(/\s+/g, " ").trim();
  }

  const p = normalize(player);
  const c = normalize(correct);

  if (!p || p.length < 2) return false;
  if (p === c) return true;
  if (p.length >= 4 && (c.includes(p) || p.includes(c))) return true;

  const correctWords = c.split(/\s+/).filter((w) => w.length >= 4);
  const playerWords = new Set(p.split(/\s+/));

  return correctWords.some((kw) => playerWords.has(kw));
}

function DifficultyStars({ level }: { level: number }) {
  return (
    <span className="text-sm tracking-widest text-amber-500">
      {"★".repeat(level)}
      <span className="text-white/20">{"★".repeat(3 - level)}</span>
    </span>
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
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onSelect(mode.id)}
            className="flex flex-col items-center gap-1 rounded-xl border border-gray-700 bg-gray-900 px-3 py-4 transition-all hover:border-amber-500/50 hover:bg-gray-800 active:scale-95"
          >
            <span className="text-base font-bold text-white">{mode.label}</span>
            <span className="text-sm font-semibold text-amber-400">
              +{mode.pts}
            </span>
            <span className="text-xs text-gray-500">{mode.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultsScreen({
  answers,
  difficulty,
}: {
  answers: AnswerRecord[];
  difficulty: QuizDifficulty;
}) {
  const score = answers.reduce((sum, answer) => sum + answer.pointsEarned, 0);
  const maxScore = answers.reduce(
    (sum, answer) => sum + answer.pointsPossible,
    0
  );
  const correctCount = answers.filter((answer) => answer.correct).length;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-8">
      <div className="flex flex-col gap-2 text-center">
        <p className="text-sm uppercase tracking-widest text-gray-500">
          Score final
        </p>
        <p className="text-5xl font-bold text-white">
          {score}
          <span className="text-2xl text-gray-600"> / {maxScore}</span>
        </p>
        <p className="text-lg text-amber-500">
          {correctCount} bonne{correctCount > 1 ? "s" : ""} réponse
          {correctCount > 1 ? "s" : ""} sur {answers.length}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {answers.map((record, index) => (
          <div
            key={`${record.question.id}-${index}`}
            className={`flex flex-col gap-1.5 rounded-xl border p-4 ${
              record.correct
                ? "border-green-800 bg-green-950/40"
                : "border-red-900 bg-red-950/40"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-widest text-gray-500">
                  Q{index + 1}
                </p>
                <span className="rounded-full border border-gray-700 px-1.5 py-0.5 text-xs text-gray-500">
                  {MODE_LABELS[record.mode]}
                </span>
              </div>

              <span
                className={`text-sm font-bold ${
                  record.correct ? "text-green-400" : "text-red-400"
                }`}
              >
                {record.correct ? `+${record.pointsEarned}` : "+0"}
              </span>
            </div>

            <p className="text-sm leading-snug text-white/80">
              {record.question.question}
            </p>

            <p className="text-sm text-gray-300">
              <span className="text-gray-500">Bonne réponse : </span>
              {record.question.options[record.question.answer_index]}
            </p>

            {!record.correct && record.playerAnswer && (
              <p className="text-xs text-gray-500">
                Votre réponse : {record.playerAnswer}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-center pb-4">
        <button
          type="button"
          onClick={() => {
            window.location.href = `/quiz?difficulty=${difficulty}`;
          }}
          className="rounded-lg bg-amber-500 px-8 py-3 font-semibold text-gray-950 transition-colors hover:bg-amber-400"
        >
          Rejouer
        </button>
      </div>
    </div>
  );
}

export default function QuizCard({
  questions,
  difficulty,
  onComplete,
}: {
  questions: QuizQuestion[];
  difficulty: QuizDifficulty;
  onComplete?: (score: number, maxScore: number) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [mode, setMode] = useState<McqMode | null>(null);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [cashInput, setCashInput] = useState("");
  const [duoIndices, setDuoIndices] = useState<[number, number] | null>(null);
  const [isValidator, setIsValidator] = useState(false);

  const total = questions.length;
  const question = questions[step];
  const sessionDone = answers.length === total;

  useEffect(() => {
  async function checkValidator() {
    const supabase = createClient();

    const { data, error } = await supabase.rpc("is_current_user_validator");

    if (error) {
      setIsValidator(false);
      return;
    }

    setIsValidator(data === true);
  }

  checkValidator();
}, []);

  async function sendQuizToRevision(questionId: string) {
    const supabase = createClient();

    const { error } = await supabase.rpc("send_quiz_question_to_revision", {
      question_id: questionId,
    });

    if (error) {
      console.error(error);
      alert("Impossible d’envoyer cette question en révision.");
      return;
    }

    alert("Question envoyée en révision.");
  }

  async function deleteQuizQuestion(questionId: string) {
    const confirmDelete = confirm(
      "Supprimer définitivement cette question de la base de données ?"
    );

    if (!confirmDelete) return;

    const supabase = createClient();

    const { error } = await supabase.rpc("delete_quiz_question", {
      question_id: questionId,
    });

    if (error) {
      console.error(error);
      alert("Impossible de supprimer cette question.");
      return;
    }

    alert("Question supprimée.");
  }

  if (!question) {
    return (
      <div className="py-16 text-center text-gray-400">
        Aucune question disponible.
      </div>
    );
  }

  const isTrueFalse = question.type === "truefalse";
  const effectiveMode: McqMode | "truefalse" = isTrueFalse
    ? "truefalse"
    : mode ?? "carre";

  const pointsPossible = MODE_POINTS[effectiveMode];

  function resetQuestionState() {
    setMode(null);
    setAnswered(false);
    setIsCorrect(false);
    setSelectedIndex(null);
    setCashInput("");
    setDuoIndices(null);
  }

  function handleSelectMode(selectedMode: McqMode) {
    setMode(selectedMode);

    if (selectedMode === "duo") {
      const wrongs = question.options
        .map((_, index) => index)
        .filter((index) => index !== question.answer_index);

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

    setSelectedIndex(index);
    setIsCorrect(index === question.answer_index);
    setAnswered(true);
  }

  function handleCashSubmit() {
    if (!cashInput.trim() || answered) return;

    const correct = isCashCorrect(
      cashInput,
      question.options[question.answer_index]
    );

    setIsCorrect(correct);
    setAnswered(true);
  }

  function handleNext() {
    const playerAnswer =
      mode === "cash"
        ? cashInput
        : selectedIndex !== null
          ? question.options[selectedIndex]
          : "";

    const newRecord: AnswerRecord = {
      question,
      mode: effectiveMode,
      playerAnswer,
      correct: isCorrect,
      pointsEarned: isCorrect ? pointsPossible : 0,
      pointsPossible,
    };

    const newAnswers = [...answers, newRecord];
    setAnswers(newAnswers);

    // Fire and forget - no await, no blocking
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

    if (step < total - 1) {
      setStep((currentStep) => currentStep + 1);
      resetQuestionState();
      return;
    }

    const finalScore = newAnswers.reduce(
      (sum, answer) => sum + answer.pointsEarned,
      0
    );
    const finalMax = newAnswers.reduce(
      (sum, answer) => sum + answer.pointsPossible,
      0
    );

    if (onComplete) {
      onComplete(finalScore, finalMax);
      return;
    }

    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) return;

        saveQuizScore(
          data.user.id,
          data.user.user_metadata?.full_name ??
            data.user.user_metadata?.name ??
            data.user.email ??
            "Joueur",
          difficulty,
          finalScore,
          finalMax
        ).catch(() => {});
      });
  }

  if (sessionDone) {
    if (onComplete) {
      return (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-sm text-gray-400">
            En attente de l&apos;adversaire…
          </p>
        </div>
      );
    }

    return <ResultsScreen answers={answers} difficulty={difficulty} />;
  }

  const displayIndices: number[] = isTrueFalse
    ? [0, 1]
    : mode === "duo"
      ? duoIndices ?? []
      : mode === "carre"
        ? question.options.map((_, index) => index)
        : [];

  const isTwoCol = isTrueFalse || mode === "duo";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 py-6">
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
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{ width: `${(step / total) * 100}%` }}
          />
        </div>
      </div>

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

      {!isTrueFalse && mode === null && !answered && (
        <ModeSelector onSelect={handleSelectMode} />
      )}

      {(isTrueFalse || mode !== null) &&
        !answered &&
        (mode === "cash" ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={cashInput}
              onChange={(event) => setCashInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCashSubmit();
              }}
              placeholder="Votre réponse…"
              autoFocus
              className="flex-1 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-amber-500 focus:outline-none"
            />

            <button
              type="button"
              onClick={handleCashSubmit}
              disabled={!cashInput.trim()}
              className="shrink-0 rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-gray-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-30"
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
            {displayIndices.map((index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleClickOption(index)}
                className={`rounded-xl border border-gray-700 bg-gray-900 px-4 py-3.5 text-sm font-medium text-gray-200 transition-all hover:border-amber-500/50 hover:bg-gray-800 ${
                  isTwoCol ? "text-center" : "text-left"
                }`}
              >
                {!isTwoCol && (
                  <span className="mr-2 text-xs text-gray-500">
                    {String.fromCharCode(65 + index)}.
                  </span>
                )}
                {question.options[index]}
              </button>
            ))}
          </div>
        ))}

      {answered && (
        <div className="flex flex-col gap-3">
          {mode !== "cash" && (
            <div
              className={`grid gap-3 ${
                isTwoCol ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"
              }`}
            >
              {displayIndices.map((index) => {
                let className =
                  "border-gray-800 bg-gray-900/40 text-gray-600 opacity-40";

                if (index === question.answer_index) {
                  className = "border-green-500 bg-green-500/10 text-green-300";
                } else if (index === selectedIndex) {
                  className = "border-red-500 bg-red-500/10 text-red-300";
                }

                return (
                  <div
                    key={index}
                    className={`rounded-xl border px-4 py-3.5 text-sm font-medium ${className} ${
                      isTwoCol ? "text-center" : "text-left"
                    }`}
                  >
                    {!isTwoCol && (
                      <span className="mr-2 text-xs opacity-60">
                        {String.fromCharCode(65 + index)}.
                      </span>
                    )}
                    {question.options[index]}
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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

              <div className="flex shrink-0 flex-col gap-2 sm:min-w-[160px]">
                {isValidator && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => sendQuizToRevision(question.id)}
                      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20"
                    >
                      ⚠️ Révision
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteQuizQuestion(question.id)}
                      className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/20"
                    >
                      🗑 Supprimer
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleNext}
                  className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-amber-400"
                >
                  {step < total - 1 ? "Suivante →" : "Résultats →"}
                </button>
              </div>
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