"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { TutorPanel } from "./_components/TutorPanel";
import { CorrectionPanel, type CorrectionStep } from "./_components/CorrectionPanel";
import { MCQOptions } from "./_components/MCQOptions";
import { NumericInput } from "./_components/NumericInput";
import { ShortTextInput } from "./_components/ShortTextInput";
import { TheoryPanel } from "./_components/TheoryPanel";

type Question = {
  id: string;
  question: string;
  type: "mcq" | "truefalse" | "numeric" | "short_text" | "multi_step";
  options: string[] | null;
  answer_index: number | null;
  difficulty_stars: number | null;
  explanation: string | null;
  concept_page_hint: number | null;
  page_range_start: number | null;
  correction_steps: CorrectionStep[] | null;
  concept_id: string | null;
  expected_numeric_answer: number | null;
  numeric_tolerance: number | null;
  numeric_unit: string | null;
  expected_text_answers: string[] | null;
  // Images extraites via Pipeline B (Vision Haiku) — schémas, formules,
  // graphiques. Affichées au-dessus de la question pour contexte visuel.
  image_url: string | null;
  image_description_md: string | null;
  image_page_number: number | null;
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
  const [grading, setGrading] = useState(false);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [wrongPhase, setWrongPhase] = useState<WrongPhase>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  // Théorie : panel intégré (ne plus ouvrir le PDF, anti-leak + extraction
  // textuelle des theory_blocks approuvés par le prof).
  const [theoryPanelConceptId, setTheoryPanelConceptId] = useState<string | null>(null);

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
    const base: QuestionResult = prev[qId] ?? {
      is_correct: false,
      requested_solution: false,
      requested_explanation: false,
    };
    questionResultsRef.current = { ...prev, [qId]: { ...base, ...update } };
  }

  /**
   * Server-side grading — anti-cheat. The truth comes from
   * POST /api/student/check-answer. Client never decides correctness.
   *
   * NEVER fall back to a client-side decision: leaking the expected
   * answer through the bootstrap payload + a client check would
   * defeat the whole purpose. If the API is down the student sees
   * an error and can retry.
   */
  async function gradeOnServer(
    questionId: string,
    studentAnswer: string | number,
  ): Promise<boolean> {
    const res = await fetch("/api/student/check-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: questionId,
        student_answer: studentAnswer,
      }),
    });
    if (!res.ok) {
      throw new Error(`grading_failed_${res.status}`);
    }
    const json = (await res.json()) as { is_correct?: boolean };
    if (typeof json.is_correct !== "boolean") {
      throw new Error("grading_failed_invalid_payload");
    }
    return json.is_correct;
  }

  function applyGradingResult(qId: string, isCorrect: boolean) {
    setAnswered(true);
    setWrongPhase(isCorrect ? null : "choosing");
    if (isCorrect) setCorrectCount((c) => c + 1);
    updateResult(qId, { is_correct: isCorrect });
  }

  async function handleSelect(optionIdx: number) {
    if (answered || grading) return;
    const q = questions[current];
    setSelected(optionIdx);
    setGradingError(null);
    setGrading(true);
    try {
      const isCorrect = await gradeOnServer(q.id, optionIdx);
      applyGradingResult(q.id, isCorrect);
    } catch {
      setGradingError(
        "Connexion interrompue, vérification impossible — réessaye.",
      );
      setSelected(null);
    } finally {
      setGrading(false);
    }
  }

  async function handleSubmitFreeform(value: string | number) {
    if (answered || grading) return;
    const q = questions[current];
    setGradingError(null);
    setGrading(true);
    try {
      const isCorrect = await gradeOnServer(q.id, value);
      applyGradingResult(q.id, isCorrect);
    } catch {
      setGradingError(
        "Connexion interrompue, vérification impossible — réessaye.",
      );
    } finally {
      setGrading(false);
    }
  }

  function handleViewResult() {
    updateResult(questions[current].id, { requested_solution: true });
    setWrongPhase("revealed");
  }

  function handleHelpMe() {
    updateResult(questions[current].id, { requested_explanation: true });
    setWrongPhase("help");
  }

  function handleOpenTheory() {
    // Ouvre le panel théorie intégré (theory_blocks + misconceptions du concept)
    // au lieu de download le PDF. Si la question n'a pas de concept_id, on
    // garde le fallback PDF en dernière ressort.
    const q = questions[current];
    if (q.concept_id) {
      setTheoryPanelConceptId(q.concept_id);
      return;
    }
    // Fallback historique : pas de concept_id sur cette question → PDF
    const page = q.concept_page_hint ?? q.page_range_start;
    if (!page) return;
    setPdfLoading(true);
    void fetch(`/api/student/assignments/${id}/course-pdf-url`)
      .then((res) => res.json())
      .then((json: { url?: string }) => {
        if (json.url) window.open(`${json.url}#page=${page}`, "_blank", "noopener,noreferrer");
      })
      .finally(() => setPdfLoading(false));
  }

  function handleRetry() {
    setSelected(null);
    setAnswered(false);
    setWrongPhase(null);
    setGradingError(null);
  }

  function handleNext() {
    if (current + 1 < questions.length) {
      setCurrent((c) => c + 1);
      setSelected(null);
      setAnswered(false);
      setWrongPhase(null);
      setGradingError(null);
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
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-700 border-t-indigo-600 mx-auto" />
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Chargement des questions…</p>
        </div>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 text-center">
        <p className="text-5xl">⚠️</p>
        <p className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Impossible de lancer le quiz</p>
        <p className="mt-2 text-sm text-red-700 dark:text-red-400">{errorMsg}</p>
        <button
          onClick={() => router.push(`/accueil/devoirs/${id}`)}
          className="mt-6 rounded-2xl border border-slate-300 dark:border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
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
      <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 text-center">
        <p className="text-6xl">{emoji}</p>
        <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{label}</p>
        <p className="mt-6 text-6xl font-black text-indigo-600 dark:text-indigo-400">{finalScore}%</p>
        <p className="mt-2 text-sm text-slate-500">
          {correctCount}/{questions.length} bonnes réponses · {fmtTime(elapsed)}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Le meilleur score est conservé.</p>
        {submitting && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Sauvegarde…</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {/* S5-3 : nouvelle entrée vers le bilan détaillé (page persistante) */}
          <button
            onClick={() => router.push(`/accueil/devoirs/${id}/bilan`)}
            className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 motion-reduce:transition-none"
          >
            Voir mon bilan
          </button>
          <button
            onClick={() => router.push(`/accueil/devoirs/${id}`)}
            className="rounded-2xl border border-slate-300 dark:border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800 motion-reduce:transition-none"
          >
            ← Retour au devoir
          </button>
          <button
            onClick={() => router.push("/accueil")}
            className="rounded-2xl border border-slate-300 dark:border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800 motion-reduce:transition-none"
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
  // Server-side grading is the single source of truth: `wrongPhase` is null
  // when the API returned is_correct=true, and set otherwise.
  const isCorrectAnswer = answered && wrongPhase === null;
  const theoryPage = q.concept_page_hint ?? q.page_range_start;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto w-full max-w-lg">

        {/* Progress header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
            {current + 1} / {questions.length}
          </span>
          <span className="font-mono text-sm text-slate-500">{fmtTime(elapsed)}</span>
        </div>

        {/* Progress bar */}
        <div className="mb-6 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-1.5 rounded-full bg-indigo-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Question */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          {/* Image extraite du syllabus (Pipeline B Vision) — schémas, formules
              ou graphiques que la question référence. Mémoire
              `project_image_strategy_phases` : layer 1 (Haiku Vision 90% cases). */}
          {q.image_url ? (
            <figure className="mb-4">
              <img
                src={q.image_url}
                alt={
                  q.image_description_md ??
                  `Illustration de la question${q.image_page_number ? ` (p. ${q.image_page_number} du syllabus)` : ""}`
                }
                className="mx-auto max-h-64 w-auto rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-800 dark:bg-slate-50"
                loading="lazy"
              />
              {q.image_page_number ? (
                <figcaption className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
                  Page {q.image_page_number} du syllabus
                </figcaption>
              ) : null}
            </figure>
          ) : null}
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-snug">{q.question}</p>

          {(q.type === "mcq" || q.type === "truefalse") ? (
            <MCQOptions
              options={q.options ?? []}
              answered={answered}
              grading={grading}
              selected={selected}
              answerIndex={q.answer_index}
              wrongPhase={wrongPhase}
              onSelect={handleSelect}
            />
          ) : q.type === "numeric" ? (
            <NumericInput
              answered={answered}
              grading={grading}
              unit={q.numeric_unit}
              onSubmit={handleSubmitFreeform}
            />
          ) : q.type === "short_text" ? (
            <ShortTextInput
              answered={answered}
              grading={grading}
              onSubmit={handleSubmitFreeform}
            />
          ) : (
            <p className="mt-6 text-sm text-slate-500">Type {q.type} non supporté</p>
          )}

          {gradingError && !answered && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-2 text-center text-sm text-red-900 dark:text-red-300"
            >
              {gradingError}
            </p>
          )}

          {/* Actions after answer */}
          {answered && (
            <div className="mt-5 space-y-3">

              {/* Correct → validation positive + next */}
              {isCorrectAnswer && (
                <>
                  <div
                    role="status"
                    aria-live="polite"
                    className="
                      flex items-center justify-center gap-2 rounded-xl border border-emerald-200
                      bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900
                      dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200
                    "
                  >
                    <CheckCircle2
                      size={18}
                      strokeWidth={2}
                      aria-hidden="true"
                      className="text-emerald-700 dark:text-emerald-400"
                    />
                    <span>Correct — bien joué.</span>
                  </div>
                  <button
                    onClick={handleNext}
                    className="w-full rounded-2xl bg-emerald-600 py-3 font-semibold text-white transition hover:bg-emerald-700"
                  >
                    {current + 1 < questions.length ? "Question suivante →" : "Voir mon score →"}
                  </button>
                </>
              )}

              {/* Wrong → choose action */}
              {wrongPhase === "choosing" && (
                <>
                  <p className="text-center text-sm font-semibold text-red-700 dark:text-red-400">Mauvaise réponse</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleViewResult}
                      className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 py-2.5 text-sm font-semibold text-amber-900 dark:text-amber-300 transition hover:border-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/40"
                    >
                      Voir le résultat
                    </button>
                    <button
                      onClick={handleHelpMe}
                      className="rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 py-2.5 text-sm font-semibold text-blue-900 dark:text-blue-300 transition hover:border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/40"
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
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 p-3">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">Explication</p>
                      <p className="text-sm text-emerald-900 dark:text-emerald-200">{q.explanation}</p>
                    </div>
                  )}
                  <button
                    onClick={handleNext}
                    className="w-full rounded-2xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-700"
                  >
                    {current + 1 < questions.length ? "Question suivante →" : "Voir mon score →"}
                  </button>
                </>
              )}

              {/* Wrong → help : correction au-dessus, tuteur dessous (mockup grid
                  2-col aplati en mobile-friendly vertical — le container est max-w-lg) */}
              {wrongPhase === "help" && (
                <>
                  <CorrectionPanel
                    steps={q.correction_steps ?? []}
                    fallbackExplanation={q.explanation}
                  />
                  <TutorPanel
                    questionId={q.id}
                    wrongAnswer={selected !== null && q.options ? q.options[selected] ?? "" : ""}
                    theoryPage={theoryPage}
                    onOpenTheory={handleOpenTheory}
                    theoryLoading={pdfLoading}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleRetry}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Réessayer
                    </button>
                    <button
                      onClick={handleNext}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 py-2.5 text-sm font-bold text-slate-500 dark:text-slate-400 transition hover:border-slate-400 dark:border-slate-500 hover:text-slate-700 dark:text-slate-300"
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
        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          {correctCount} bonne{correctCount !== 1 ? "s" : ""} réponse{correctCount !== 1 ? "s" : ""} sur{" "}
          {current + (answered ? 1 : 0)} question{current + (answered ? 1 : 0) !== 1 ? "s" : ""}
        </p>

      </div>

      {/* Panel théorie (overlay modal) — remplace l'ouverture PDF */}
      {theoryPanelConceptId ? (
        <TheoryPanel
          conceptId={theoryPanelConceptId}
          onClose={() => setTheoryPanelConceptId(null)}
        />
      ) : null}
    </main>
  );
}
