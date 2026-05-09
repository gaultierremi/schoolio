"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Question = {
  id: string;
  question: string;
  type: "mcq" | "truefalse";
  options: string[];
  answer_index: number;
  difficulty_stars: number | null;
};

type Phase = "loading" | "quiz" | "finished" | "error";

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function AssignmentQuizPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Start quiz on mount
  useEffect(() => {
    fetch(`/api/student/assignments/${id}/start-quiz`, { method: "POST" })
      .then((r) => r.json())
      .then((j: { questions?: Question[]; error?: string }) => {
        if (j.error || !j.questions || j.questions.length === 0) {
          setErrorMsg(j.error ?? "Aucune question disponible");
          setPhase("error");
          return;
        }
        // Shuffle questions for variety
        const shuffled = [...j.questions].sort(() => Math.random() - 0.5);
        setQuestions(shuffled);
        startTimeRef.current = Date.now();
        setPhase("quiz");

        timerRef.current = setInterval(() => {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);
      })
      .catch(() => {
        setErrorMsg("Erreur de connexion");
        setPhase("error");
      });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [id]);

  function handleSelect(optionIdx: number) {
    if (answered) return;
    setSelected(optionIdx);
    setAnswered(true);
    if (optionIdx === questions[current].answer_index) {
      setCorrectCount((c) => c + 1);
    }
  }

  function handleNext() {
    if (current + 1 < questions.length) {
      setCurrent((c) => c + 1);
      setSelected(null);
      setAnswered(false);
    } else {
      // Finish
      if (timerRef.current) clearInterval(timerRef.current);
      const score = Math.round(((correctCount + (selected === questions[current].answer_index ? 1 : 0)) / questions.length) * 100);
      setFinalScore(score);
      setPhase("finished");
      submitResult(score);
    }
  }

  async function submitResult(score: number) {
    setSubmitting(true);
    await fetch(`/api/student/assignments/${id}/finish-quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, duration_seconds: elapsed }),
    });
    setSubmitting(false);
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-700 border-t-purple-500 mx-auto" />
          <p className="mt-4 text-sm text-gray-400">Chargement des questions…</p>
        </div>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 text-center">
        <p className="text-5xl">⚠️</p>
        <p className="mt-4 text-lg font-black text-white">Impossible de lancer le quiz</p>
        <p className="mt-2 text-sm text-red-400">{errorMsg}</p>
        <button
          onClick={() => router.push(`/student/assignments/${id}`)}
          className="mt-6 rounded-2xl border border-gray-700 px-5 py-2.5 text-sm font-bold text-gray-300 transition hover:text-white"
        >
          ← Retour au devoir
        </button>
      </main>
    );
  }

  // ── Score screen ───────────────────────────────────────────────────────────

  if (phase === "finished") {
    const emoji = finalScore >= 80 ? "🏆" : finalScore >= 50 ? "👍" : "💪";
    const label = finalScore >= 80 ? "Excellent !" : finalScore >= 50 ? "Bien joué !" : "Continue les efforts !";
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 text-center">
        <p className="text-6xl">{emoji}</p>
        <p className="mt-4 text-2xl font-black text-white">{label}</p>
        <p className="mt-6 text-6xl font-black text-purple-400">{finalScore}%</p>
        <p className="mt-2 text-sm text-gray-500">
          {correctCount}/{questions.length} bonnes réponses · {fmtTime(elapsed)}
        </p>
        <p className="mt-1 text-xs text-gray-600">
          {finalScore > (finalScore) ? "Nouveau meilleur score !" : "Le meilleur score est conservé."}
        </p>
        {submitting && <p className="mt-3 text-xs text-gray-600">Sauvegarde…</p>}
        <div className="mt-8 flex gap-3">
          <button
            onClick={() => router.push(`/student/assignments/${id}`)}
            className="rounded-2xl border border-gray-700 px-5 py-2.5 text-sm font-bold text-gray-300 transition hover:text-white"
          >
            ← Retour au devoir
          </button>
          <button
            onClick={() => router.push("/student")}
            className="rounded-2xl bg-purple-500 px-5 py-2.5 text-sm font-black text-gray-950 transition hover:bg-purple-400"
          >
            Mon espace
          </button>
        </div>
      </main>
    );
  }

  // ── Quiz ───────────────────────────────────────────────────────────────────

  const q = questions[current];
  const progress = ((current) / questions.length) * 100;

  const optionStyle = (idx: number): string => {
    if (!answered) {
      return "border-gray-700 text-gray-300 hover:border-purple-500/60 hover:bg-purple-500/5 cursor-pointer";
    }
    if (idx === q.answer_index) return "border-green-500 bg-green-500/10 text-green-300 font-bold";
    if (idx === selected && idx !== q.answer_index) return "border-red-500 bg-red-500/10 text-red-300";
    return "border-gray-800 text-gray-600";
  };

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-lg">

        {/* Progress header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-gray-400">
            {current + 1} / {questions.length}
          </span>
          <span className="font-mono text-sm text-gray-500">{fmtTime(elapsed)}</span>
        </div>

        {/* Progress bar */}
        <div className="mb-6 h-1.5 rounded-full bg-gray-800">
          <div
            className="h-1.5 rounded-full bg-purple-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Question */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <p className="text-lg font-black text-white leading-snug">{q.question}</p>

          <div className="mt-6 space-y-3">
            {q.options.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => handleSelect(idx)}
                className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${optionStyle(idx)}`}
              >
                <span className="font-bold text-gray-500 mr-2">{String.fromCharCode(65 + idx)}.</span>
                {opt}
              </button>
            ))}
          </div>

          {answered && (
            <button
              onClick={handleNext}
              className="mt-5 w-full rounded-2xl bg-purple-500 py-3 font-black text-gray-950 transition hover:bg-purple-400"
            >
              {current + 1 < questions.length ? "Question suivante →" : "Voir mon score →"}
            </button>
          )}
        </div>

        {/* Score preview */}
        <p className="mt-4 text-center text-xs text-gray-600">
          {correctCount} bonne{correctCount !== 1 ? "s" : ""} réponse{correctCount !== 1 ? "s" : ""} sur {current + (answered ? 1 : 0)} question{current + (answered ? 1 : 0) !== 1 ? "s" : ""}
        </p>

      </div>
    </main>
  );
}
