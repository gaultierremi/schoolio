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
  explanation: string | null;
  concept_page_hint: number | null;
  page_range_start: number | null;
};

type QuestionResult = {
  is_correct: boolean;
  requested_solution: boolean;
  requested_explanation: boolean;
};

type Phase = "loading" | "quiz" | "finished" | "error";
type WrongPhase = null | "choosing" | "revealed" | "help";

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
  const [wrongPhase, setWrongPhase] = useState<WrongPhase>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const questionResultsRef = useRef<Record<string, QuestionResult>>({});

  useEffect(() => {
    fetch(`/api/student/assignments/${id}/start-quiz`, { method: "POST" })
      .then((r) => r.json())
      .then((j: { questions?: Question[]; error?: string }) => {
        if (j.error || !j.questions || j.questions.length === 0) {
          setErrorMsg(j.error ?? "Aucune question disponible");
          setPhase("error");
          return;
        }
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
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [id]);

  function updateResult(qId: string, update: Partial<QuestionResult>) {
    const prev = questionResultsRef.current;
    questionResultsRef.current = {
      ...prev,
      [qId]: {
        is_correct: false,
        requested_solution: false,
        requested_explanation: false,
        ...(prev[qId] ?? {}),
        ...update,
      },
    };
  }

  function handleSelect(optionIdx: number) {
    if (answered) return;
    const isCorrect = optionIdx === questions[current].answer_index;
    setSelected(optionIdx);
    setAnswered(true);
    setWrongPhase(isCorrect ? null : "choosing");
    if (isCorrect) setCorrectCount((c) => c + 1);
    updateResult(questions[current].id, { is_correct: isCorrect });
  }

  function handleViewResult() {
    updateResult(questions[current].id, { requested_solution: true });
    setWrongPhase("revealed");
  }

  function handleHelpMe() {
    updateResult(questions[current].id, { requested_explanation: true });
    setWrongPhase("help");
  }

  async function handleOpenTheory() {
    const q = questions[current];
    const page = q.concept_page_hint ?? q.page_range_start;
    if (!page) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/student/assignments/${id}/course-pdf-url`);
      const json = await res.json() as { url?: string };
      if (json.url) window.open(`${json.url}#page=${page}`, "_blank");
    } finally {
      setPdfLoading(false);
    }
  }

  function handleRetry() {
    setSelected(null);
    setAnswered(false);
    setWrongPhase(null);
  }

  function handleNext() {
    if (current + 1 < questions.length) {
      setCurrent((c) => c + 1);
      setSelected(null);
      setAnswered(false);
      setWrongPhase(null);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      const score = Math.round((correctCount / questions.length) * 100);
      setFinalScore(score);
      setPhase("finished");
      submitResult(score);
    }
  }

  async function submitResult(score: number) {
    setSubmitting(true);
    const question_answers = Object.entries(questionResultsRef.current).map(
      ([question_id, r]) => ({ question_id, ...r })
    );
    await fetch(`/api/student/assignments/${id}/finish-quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, duration_seconds: elapsed, question_answers }),
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
    const label =
      finalScore >= 80 ? "Excellent !" : finalScore >= 50 ? "Bien joué !" : "Continue les efforts !";
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 text-center">
        <p className="text-6xl">{emoji}</p>
        <p className="mt-4 text-2xl font-black text-white">{label}</p>
        <p className="mt-6 text-6xl font-black text-purple-400">{finalScore}%</p>
        <p className="mt-2 text-sm text-gray-500">
          {correctCount}/{questions.length} bonnes réponses · {fmtTime(elapsed)}
        </p>
        <p className="mt-1 text-xs text-gray-400">Le meilleur score est conservé.</p>
        {submitting && <p className="mt-3 text-xs text-gray-400">Sauvegarde…</p>}
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
  const progress = (current / questions.length) * 100;
  const isCorrectAnswer = answered && selected === q.answer_index;
  const theoryPage = q.concept_page_hint ?? q.page_range_start;

  const optionStyle = (idx: number): string => {
    if (!answered) {
      return "border-gray-700 text-gray-300 hover:border-purple-500/60 hover:bg-purple-500/5 cursor-pointer";
    }
    if (wrongPhase === "choosing" || wrongPhase === "help") {
      if (idx === selected) return "border-red-500 bg-red-500/10 text-red-300";
      return "border-gray-800 text-gray-600";
    }
    // null (correct) or "revealed" — show correct answer
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
                disabled={answered}
                className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${optionStyle(idx)}`}
              >
                <span className="font-bold text-gray-500 mr-2">{String.fromCharCode(65 + idx)}.</span>
                {opt}
              </button>
            ))}
          </div>

          {/* Actions after answer */}
          {answered && (
            <div className="mt-5 space-y-3">

              {/* Correct → next */}
              {isCorrectAnswer && (
                <button
                  onClick={handleNext}
                  className="w-full rounded-2xl bg-green-600 py-3 font-black text-white transition hover:bg-green-500"
                >
                  {current + 1 < questions.length ? "Question suivante →" : "Voir mon score →"}
                </button>
              )}

              {/* Wrong → choose action */}
              {wrongPhase === "choosing" && (
                <>
                  <p className="text-center text-sm font-bold text-red-400">Mauvaise réponse</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleViewResult}
                      className="rounded-xl border border-amber-600/40 bg-amber-500/10 py-2.5 text-sm font-bold text-amber-300 transition hover:border-amber-500/60 hover:bg-amber-500/15"
                    >
                      Voir le résultat
                    </button>
                    <button
                      onClick={handleHelpMe}
                      className="rounded-xl border border-blue-600/40 bg-blue-500/10 py-2.5 text-sm font-bold text-blue-300 transition hover:border-blue-500/60 hover:bg-blue-500/15"
                    >
                      J&apos;ai pas compris
                    </button>
                  </div>
                </>
              )}

              {/* Wrong → solution revealed */}
              {wrongPhase === "revealed" && (
                <>
                  {q.explanation && (
                    <div className="rounded-xl border border-green-800/40 bg-green-950/30 p-3">
                      <p className="text-xs font-bold text-green-400 mb-1">Explication</p>
                      <p className="text-sm text-green-200">{q.explanation}</p>
                    </div>
                  )}
                  <button
                    onClick={handleNext}
                    className="w-full rounded-2xl bg-purple-500 py-3 font-black text-gray-950 transition hover:bg-purple-400"
                  >
                    {current + 1 < questions.length ? "Question suivante →" : "Voir mon score →"}
                  </button>
                </>
              )}

              {/* Wrong → help (theory) */}
              {wrongPhase === "help" && (
                <>
                  <div className="rounded-xl border border-blue-800/40 bg-blue-950/30 p-3">
                    <p className="text-xs font-bold text-blue-400 mb-1">Revois la théorie</p>
                    {theoryPage ? (
                      <button
                        onClick={handleOpenTheory}
                        disabled={pdfLoading}
                        className="mt-1 text-sm font-bold text-blue-300 underline underline-offset-2 hover:text-blue-200 disabled:opacity-50"
                      >
                        {pdfLoading ? "Chargement…" : `📄 Ouvrir le cours (p. ${theoryPage}) →`}
                      </button>
                    ) : (
                      <p className="text-sm text-blue-200">
                        Consulte la section correspondante dans ton cours, puis réessaie.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleRetry}
                      className="rounded-xl border border-gray-700 py-2.5 text-sm font-bold text-gray-300 transition hover:border-gray-500 hover:text-white"
                    >
                      ↩ Réessayer
                    </button>
                    <button
                      onClick={handleNext}
                      className="rounded-xl border border-gray-700 py-2.5 text-sm font-bold text-gray-400 transition hover:border-gray-500 hover:text-gray-300"
                    >
                      {current + 1 < questions.length ? "Passer →" : "Terminer →"}
                    </button>
                  </div>
                </>
              )}

            </div>
          )}
        </div>

        {/* Running score */}
        <p className="mt-4 text-center text-xs text-gray-400">
          {correctCount} bonne{correctCount !== 1 ? "s" : ""} réponse{correctCount !== 1 ? "s" : ""} sur{" "}
          {current + (answered ? 1 : 0)} question{current + (answered ? 1 : 0) !== 1 ? "s" : ""}
        </p>

      </div>
    </main>
  );
}
