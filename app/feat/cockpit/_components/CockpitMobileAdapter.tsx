"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PdfPageNavigator } from "@/components/ui/PdfPageNavigator";
import { ZoomControls } from "@/components/ui/ZoomControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ContextualQuestionCard } from "@/components/ui/ContextualQuestionCard";
import { RandomPickAnimation, type Student } from "@/components/ui/RandomPickAnimation";
import { QuestionFlowModal } from "@/components/teacher-live/QuestionFlowModal";
import { MOCK_STUDENTS } from "@/types/post-course";
import type { ContextualQuestion, } from "@/lib/contextual-questions";
import type { WhisperMessage } from "@/types/post-course";
import { Mic, MicOff, X } from "lucide-react";

type QuestionFlow =
  | { stage: "idle" }
  | { stage: "projecting"; question: ContextualQuestion }
  | { stage: "revealed"; question: ContextualQuestion };

export type CockpitMobileAdapterProps = {
  sessionCode: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  listening: boolean;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onEnd: () => void;
  onListenToggle: (active: boolean) => void;
};

const SUGGESTION_DEBOUNCE_MS = 1500;
const MAX_AI_ATTEMPTS = 3;
const WHISPER_DISMISS_MS = 8_000;

const MOCK_PICK_CANDIDATES: Student[] = MOCK_STUDENTS.map((s) => ({
  id: s.id,
  name: s.name,
}));

export function CockpitMobileAdapter({
  sessionCode,
  currentPage,
  totalPages,
  zoom,
  listening,
  onPageChange,
  onZoomChange,
  onEnd,
  onListenToggle,
}: CockpitMobileAdapterProps) {
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // ── Random pick (mock) ─────────────────────────────────────────────────────
  const [showPickAnimation, setShowPickAnimation] = useState(false);
  const [pickedStudent, setPickedStudent] = useState<Student | null>(null);
  const [pickCounts, setPickCounts] = useState<Record<string, number>>({});

  function handleRandomPick() {
    const counts = pickCounts;
    const sorted = [...MOCK_PICK_CANDIDATES].sort(
      (a, b) => (counts[a.id] ?? 0) - (counts[b.id] ?? 0),
    );
    const minCount = counts[sorted[0].id] ?? 0;
    const leastPicked = sorted.filter((s) => (counts[s.id] ?? 0) === minCount);
    const idx = Math.floor(Math.random() * leastPicked.length);
    setPickedStudent(leastPicked[idx]);
    setShowPickAnimation(true);
  }

  function handlePickConfirm() {
    if (pickedStudent) {
      setPickCounts((prev) => ({
        ...prev,
        [pickedStudent.id]: (prev[pickedStudent.id] ?? 0) + 1,
      }));
    }
    setShowPickAnimation(false);
    setPickedStudent(null);
  }

  function handlePickCancel() {
    setShowPickAnimation(false);
    setPickedStudent(null);
  }

  // ── Contextual questions ───────────────────────────────────────────────────
  const [suggestedQuestions, setSuggestedQuestions] = useState<ContextualQuestion[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [aiGenAttempts, setAiGenAttempts] = useState(0);
  const [projectedQuestionIds, setProjectedQuestionIds] = useState(new Set<string>());
  const [questionFlow, setQuestionFlow] = useState<QuestionFlow>({ stage: "idle" });
  const [isProjectingId, setIsProjectingId] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const suggestionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedPageRef = useRef<number | null>(null);

  // ── Whisper IA ─────────────────────────────────────────────────────────────
  const [whisper, setWhisper] = useState<WhisperMessage | null>(null);
  const whisperDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWhisperPageRef = useRef<number | null>(null);

  function showWhisper(msg: WhisperMessage) {
    setWhisper(msg);
    if (whisperDismissRef.current) clearTimeout(whisperDismissRef.current);
    whisperDismissRef.current = setTimeout(() => setWhisper(null), WHISPER_DISMISS_MS);
  }

  async function triggerWhisper(page: number) {
    if (lastWhisperPageRef.current === page) return;
    lastWhisperPageRef.current = page;
    try {
      const res = await fetch(`/api/feat/cockpit/sessions/${sessionCode}/whisper`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page }),
      });
      if (!res.ok) return;
      const json = await res.json() as { whisper: WhisperMessage };
      showWhisper(json.whisper);
    } catch {
      // non-blocking
    }
  }

  const fetchSuggestions = useCallback(async (page: number, withGenerate = false) => {
    setIsLoadingQuestions(true);
    try {
      const qs = new URLSearchParams({ page: String(page) });
      if (withGenerate) qs.set("generate", "true");
      const res = await fetch(
        `/api/feat/cockpit/sessions/${sessionCode}/contextual-questions?${qs.toString()}`,
      );
      if (!res.ok) return;
      const data = await res.json() as { questions: ContextualQuestion[] };
      setSuggestedQuestions(data.questions ?? []);
      lastFetchedPageRef.current = page;
    } catch {
      // noop
    } finally {
      setIsLoadingQuestions(false);
    }
  }, [sessionCode]);

  useEffect(() => {
    fetchSuggestions(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lastFetchedPageRef.current === currentPage) return;
    if (suggestionDebounceRef.current) clearTimeout(suggestionDebounceRef.current);
    suggestionDebounceRef.current = setTimeout(() => {
      fetchSuggestions(currentPage);
      if (listening) triggerWhisper(currentPage);
    }, SUGGESTION_DEBOUNCE_MS);
    return () => { if (suggestionDebounceRef.current) clearTimeout(suggestionDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, fetchSuggestions, listening]);

  // ── Question projection ────────────────────────────────────────────────────
  async function handleProjectQuestion(question: ContextualQuestion) {
    if (isProjectingId || questionFlow.stage !== "idle") return;
    setIsProjectingId(question.id);
    try {
      const res = await fetch(`/api/feat/cockpit/sessions/${sessionCode}/project-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: question.id }),
      });
      if (!res.ok) return;
      setQuestionFlow({ stage: "projecting", question });
    } catch {
      // noop
    } finally {
      setIsProjectingId(null);
    }
  }

  async function handleRevealAnswer() {
    if (isRevealing || questionFlow.stage === "idle") return;
    setIsRevealing(true);
    try {
      const res = await fetch(`/api/feat/cockpit/sessions/${sessionCode}/project-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show_answer: true }),
      });
      if (!res.ok) return;
      setQuestionFlow((prev) =>
        prev.stage !== "idle" ? { stage: "revealed", question: prev.question } : prev,
      );
    } catch {
      // noop
    } finally {
      setIsRevealing(false);
    }
  }

  async function handleBackToPdf() {
    if (questionFlow.stage === "idle") return;
    const usedId = questionFlow.question.id;
    try {
      await fetch(`/api/feat/cockpit/sessions/${sessionCode}/back-to-pdf`, { method: "POST" });
    } catch {
      // noop
    }
    setProjectedQuestionIds((prev) => new Set([...prev, usedId]));
    setQuestionFlow({ stage: "idle" });
  }

  function handleGenerateAI() {
    if (aiGenAttempts >= MAX_AI_ATTEMPTS || isLoadingQuestions) return;
    setAiGenAttempts((n) => n + 1);
    fetchSuggestions(currentPage, true);
  }

  const activeProjectedId = questionFlow.stage !== "idle" ? questionFlow.question.id : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-stone-950 text-white lg:hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-800 bg-stone-900 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold tracking-widest text-violet-400">
            #{sessionCode}
          </span>
          <span className="text-xs text-stone-500">
            {totalPages > 0 ? `p.${currentPage}/${totalPages}` : "…"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onListenToggle(!listening)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              listening
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                : "bg-stone-800 text-stone-400 border border-stone-700 hover:text-stone-200"
            }`}
            type="button"
          >
            {listening ? <Mic size={12} /> : <MicOff size={12} />}
            {listening ? "Actif" : "Micro"}
          </button>
          <button
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-black text-red-300 hover:bg-red-500/20"
            onClick={() => setShowEndConfirm(true)}
            type="button"
          >
            ✕
          </button>
        </div>
      </header>

      {/* ── Scrollable main ────────────────────────────────────────────────── */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#44403c transparent" }}
      >
        {/* Page navigation */}
        <div className="border-b border-stone-800 px-3 py-3">
          <p className="mb-3 text-center text-xs font-black uppercase tracking-widest text-stone-500">
            {totalPages > 0 ? `Page ${currentPage} / ${totalPages}` : "Chargement…"}
          </p>
          <div className="flex flex-col items-center gap-2">
            <PdfPageNavigator
              currentPage={currentPage}
              disabled={totalPages === 0}
              onPageChange={onPageChange}
              size="compact"
              totalPages={totalPages || 1}
            />
            <ZoomControls
              captureKeyboard
              disabled={totalPages === 0}
              onZoomChange={onZoomChange}
              size="compact"
              zoom={zoom}
            />
          </div>
        </div>

        {/* Contextual questions */}
        <div className="border-b border-stone-800 px-3 py-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-widest text-stone-500">
              Questions ({suggestedQuestions.length})
            </p>
            {aiGenAttempts < MAX_AI_ATTEMPTS ? (
              <button
                className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs font-semibold text-violet-300 transition-colors hover:bg-violet-500/20 disabled:opacity-60"
                disabled={isLoadingQuestions}
                onClick={handleGenerateAI}
                type="button"
              >
                {isLoadingQuestions ? "…" : "⚡ Générer avec IA"}
              </button>
            ) : (
              <span className="text-xs text-stone-500">IA ({MAX_AI_ATTEMPTS}/{MAX_AI_ATTEMPTS})</span>
            )}
          </div>

          {isLoadingQuestions ? (
            <div className="space-y-2">
              <div className="h-16 animate-pulse rounded-xl bg-stone-800" />
              <div className="h-16 animate-pulse rounded-xl bg-stone-800" />
            </div>
          ) : suggestedQuestions.length === 0 ? (
            <p className="py-2 text-center text-xs text-stone-600">
              {aiGenAttempts >= MAX_AI_ATTEMPTS
                ? "Génération IA indisponible · Génère avec l'IA pour ce passage"
                : "Aucune question pour cette page · Génère avec l'IA"}
            </p>
          ) : (
            <div className="space-y-2">
              {suggestedQuestions.map((q) => {
                const isThisProjected =
                  projectedQuestionIds.has(q.id) ||
                  (questionFlow.stage === "revealed" && questionFlow.question.id === q.id);
                const isThisProjecting = isProjectingId === q.id;
                const isThisActive = activeProjectedId === q.id;
                return (
                  <ContextualQuestionCard
                    alreadyProjected={isThisProjected}
                    className={
                      isThisActive && !isThisProjected
                        ? "border-violet-500/50 ring-1 ring-violet-500/30"
                        : undefined
                    }
                    correctAnswerLetter={String.fromCharCode(65 + q.answer_index)}
                    isProjecting={isThisProjecting}
                    key={q.id}
                    onClick={() => handleProjectQuestion(q)}
                    options={q.options.map((text, i) => ({ letter: String.fromCharCode(65 + i), text }))}
                    origin={q.origin}
                    pageRange={
                      q.page_range_start != null
                        ? { start: q.page_range_start, end: q.page_range_end! }
                        : undefined
                    }
                    questionId={q.id}
                    questionText={q.question}
                    size="compact"
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Random pick */}
        <div className="border-b border-stone-800 px-3 py-4">
          <button
            className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-violet-500 py-4 text-base font-black text-white shadow-lg shadow-violet-950/30 transition-opacity active:opacity-80"
            onClick={handleRandomPick}
            type="button"
          >
            🎲 Tirer un élève
          </button>
        </div>

        {/* Students */}
        <div className="px-3 pb-4 pt-3">
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-stone-500">
            Élèves ({MOCK_STUDENTS.length})
          </p>
          <div className="space-y-1">
            {MOCK_STUDENTS.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-xl bg-stone-900 px-3 py-2"
              >
                <span className="text-lg">{s.avatar}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-200 truncate">{s.name}</p>
                  <p className="text-xs text-stone-500">{s.level}</p>
                </div>
                {(pickCounts[s.id] ?? 0) > 0 && (
                  <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-400">
                    ×{pickCounts[s.id]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-stone-800 bg-stone-900/80 px-3 py-3">
        <button
          className="w-full rounded-xl border border-red-500/40 bg-red-500/10 py-3 text-sm font-black text-red-300 hover:bg-red-500/20"
          onClick={() => setShowEndConfirm(true)}
          type="button"
        >
          Terminer le cours
        </button>
      </footer>

      {/* ── Overlays ───────────────────────────────────────────────────────── */}
      <ConfirmDialog
        confirmLabel="Terminer"
        description="La session sera fermée. Tu seras redirigé vers le résumé de cours."
        isOpen={showEndConfirm}
        onCancel={() => setShowEndConfirm(false)}
        onConfirm={onEnd}
        title="Terminer le cours ?"
        variant="destructive"
      />

      {showPickAnimation && pickedStudent ? (
        <RandomPickAnimation
          candidates={MOCK_PICK_CANDIDATES}
          isVisible={showPickAnimation}
          onCancel={handlePickCancel}
          onClose={handlePickConfirm}
          selectedStudent={pickedStudent}
        />
      ) : null}

      {questionFlow.stage !== "idle" ? (
        <QuestionFlowModal
          isRevealing={isRevealing}
          onBackToPdf={handleBackToPdf}
          onReveal={handleRevealAnswer}
          question={questionFlow.question}
          stage={questionFlow.stage}
        />
      ) : null}

      {/* ── Whisper Bubble ─────────────────────────────────────────────────── */}
      {whisper && (
        <div
          className="absolute bottom-20 left-3 right-3 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-2xl bg-stone-800/95 border border-stone-700 px-4 py-3 shadow-xl backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0">{whisper.avatar}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-semibold text-stone-300">{whisper.student}</p>
                  {whisper.source === "ai" && (
                    <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-bold text-violet-400 uppercase tracking-wider">
                      IA
                    </span>
                  )}
                </div>
                <p className="text-sm text-stone-200 leading-snug">{whisper.text}</p>
              </div>
              <button
                onClick={() => setWhisper(null)}
                className="shrink-0 text-stone-500 hover:text-stone-300 transition-colors"
                type="button"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CockpitMobileAdapter;
