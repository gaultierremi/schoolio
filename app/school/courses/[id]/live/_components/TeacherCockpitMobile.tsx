"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AttendanceRow, type AttendanceStatus } from "@/components/ui/AttendanceRow";
import { PdfPageNavigator } from "@/components/ui/PdfPageNavigator";
import { ZoomControls } from "@/components/ui/ZoomControls";
import { LiveSessionTimer } from "@/components/ui/LiveSessionTimer";
import { PairingCodeDisplay } from "@/components/ui/PairingCodeDisplay";
import { RandomPickAnimation, type Student } from "@/components/ui/RandomPickAnimation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ContextualQuestionCard } from "@/components/ui/ContextualQuestionCard";
import { StudentPickBadge } from "@/components/ui/StudentPickBadge";
import { QuestionFlowModal } from "@/components/teacher-live/QuestionFlowModal";
import MiniPdfPreview from "./MiniPdfPreview";
import type { ContextualQuestion } from "@/lib/contextual-questions";

type Member = { student_user_id: string; display_name: string };

type PickResult = {
  pick_id: string;
  student_user_id: string;
  student_name: string;
  all_candidates: Array<{ student_user_id: string; student_name: string }>;
};

type QuestionFlow =
  | { stage: "idle" }
  | { stage: "projecting"; question: ContextualQuestion }
  | { stage: "revealed"; question: ContextualQuestion };

export type TeacherCockpitMobileProps = {
  session: { id: string; code: string } | null;
  pdfUrl: string | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  members: Member[];
  attendance: Record<string, AttendanceStatus>;
  classId: string;
  sessionId: string;
  startedAt: Date;
  endsAt: Date;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onAttendanceChange: (studentId: string, status: AttendanceStatus) => void;
  onEnd: () => void;
  onRegenerate: () => void;
};

const PICK_STATS_INTERVAL_MS = 2 * 60 * 1000;
const SUGGESTION_DEBOUNCE_MS = 1500;
const MAX_AI_ATTEMPTS = 3;

export function TeacherCockpitMobile({
  session,
  pdfUrl,
  currentPage,
  totalPages,
  zoom,
  members,
  attendance,
  classId,
  sessionId,
  startedAt,
  endsAt,
  onPageChange,
  onZoomChange,
  onAttendanceChange,
  onEnd,
  onRegenerate,
}: TeacherCockpitMobileProps) {
  // ── Random pick ────────────────────────────────────────────────────────────
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isPickLoading, setIsPickLoading] = useState(false);
  const [showPickAnimation, setShowPickAnimation] = useState(false);
  const [pickResult, setPickResult] = useState<PickResult | null>(null);
  const [pickCounts, setPickCounts] = useState<Record<string, number>>({});
  const pickRefetchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Contextual questions ────────────────────────────────────────────────────
  const [suggestedQuestions, setSuggestedQuestions] = useState<ContextualQuestion[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [aiGenAttempts, setAiGenAttempts] = useState(0);
  const [projectedQuestionIds, setProjectedQuestionIds] = useState(new Set<string>());
  const [questionFlow, setQuestionFlow] = useState<QuestionFlow>({ stage: "idle" });
  const [isProjectingId, setIsProjectingId] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const suggestionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedPageRef = useRef<number | null>(null);

  // ── Pick stats ─────────────────────────────────────────────────────────────
  const fetchPickStats = useCallback(async () => {
    if (!classId) return;
    try {
      const res = await fetch(`/api/classes/${classId}/pick-stats`);
      if (!res.ok) return;
      const data = await res.json() as Array<{ student_user_id: string; pick_count_30d: number }>;
      const counts: Record<string, number> = {};
      data.forEach((s) => { counts[s.student_user_id] = s.pick_count_30d; });
      setPickCounts(counts);
    } catch {
      // Non-blocking
    }
  }, [classId]);

  useEffect(() => {
    if (!classId) return;
    fetchPickStats();
    pickRefetchRef.current = setInterval(fetchPickStats, PICK_STATS_INTERVAL_MS);
    return () => { if (pickRefetchRef.current) clearInterval(pickRefetchRef.current); };
  }, [classId, fetchPickStats]);

  // ── Contextual questions fetch ─────────────────────────────────────────────
  const fetchSuggestions = useCallback(async (page: number, withGenerate = false) => {
    if (!sessionId) return;
    setIsLoadingQuestions(true);
    try {
      const qs = new URLSearchParams({ page: String(page) });
      if (withGenerate) qs.set("generate", "true");
      const res = await fetch(`/api/live-sessions/${sessionId}/contextual-questions?${qs.toString()}`);
      if (!res.ok) return;
      const data = await res.json() as { questions: ContextualQuestion[] };
      setSuggestedQuestions(data.questions ?? []);
      lastFetchedPageRef.current = page;
    } catch {
      // noop
    } finally {
      setIsLoadingQuestions(false);
    }
  }, [sessionId]);

  // Initial fetch on mount
  useEffect(() => {
    if (sessionId) fetchSuggestions(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Debounced refetch on page change
  useEffect(() => {
    if (!sessionId || lastFetchedPageRef.current === currentPage) return;
    if (suggestionDebounceRef.current) clearTimeout(suggestionDebounceRef.current);
    suggestionDebounceRef.current = setTimeout(() => {
      fetchSuggestions(currentPage);
    }, SUGGESTION_DEBOUNCE_MS);
    return () => { if (suggestionDebounceRef.current) clearTimeout(suggestionDebounceRef.current); };
  }, [currentPage, sessionId, fetchSuggestions]);

  // ── Handlers — random pick ─────────────────────────────────────────────────
  async function handleRandomPick() {
    if (!classId || isPickLoading) return;
    setIsPickLoading(true);
    try {
      const res = await fetch(`/api/classes/${classId}/random-pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ live_session_id: sessionId || undefined }),
      });
      if (!res.ok) return;
      const data = await res.json() as PickResult;
      setPickResult(data);
      setShowPickAnimation(true);
    } catch {
      // noop
    } finally {
      setIsPickLoading(false);
    }
  }

  function handlePickConfirm() {
    if (pickResult) {
      setPickCounts((prev) => ({
        ...prev,
        [pickResult.student_user_id]: (prev[pickResult.student_user_id] ?? 0) + 1,
      }));
    }
    setShowPickAnimation(false);
    setPickResult(null);
  }

  async function handlePickCancel() {
    if (pickResult) {
      await fetch(`/api/classes/${classId}/random-pick/${pickResult.pick_id}/cancel`, {
        method: "POST",
      }).catch(() => undefined);
    }
    setShowPickAnimation(false);
    setPickResult(null);
  }

  // ── Handlers — question projection ────────────────────────────────────────
  async function handleProjectQuestion(question: ContextualQuestion) {
    if (isProjectingId || !sessionId || questionFlow.stage !== "idle") return;
    setIsProjectingId(question.id);
    try {
      const res = await fetch(`/api/live-sessions/${sessionId}/project-question`, {
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
    if (isRevealing || !sessionId || questionFlow.stage === "idle") return;
    setIsRevealing(true);
    try {
      const res = await fetch(`/api/live-sessions/${sessionId}/project-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show_answer: true }),
      });
      if (!res.ok) return;
      if (questionFlow.stage !== "idle") {
        setQuestionFlow({ stage: "revealed", question: questionFlow.question });
      }
    } catch {
      // noop
    } finally {
      setIsRevealing(false);
    }
  }

  async function handleBackToPdf() {
    if (!sessionId || questionFlow.stage === "idle") return;
    const usedId = questionFlow.question.id;
    try {
      await fetch(`/api/live-sessions/${sessionId}/back-to-pdf`, { method: "POST" });
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

  // ── Derived ────────────────────────────────────────────────────────────────
  const pickCandidates: Student[] = pickResult?.all_candidates.map((c) => ({
    id: c.student_user_id,
    name: c.student_name,
  })) ?? [];

  const pickedStudent: Student | undefined = pickResult
    ? { id: pickResult.student_user_id, name: pickResult.student_name }
    : undefined;

  const hasClass = Boolean(classId && members.length > 0);
  const activeProjectedId = questionFlow.stage !== "idle" ? questionFlow.question.id : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-white lg:hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-800 bg-gray-900 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {session ? (
            <PairingCodeDisplay code={session.code} size="compact" onRegenerate={onRegenerate} />
          ) : null}
          <LiveSessionTimer endsAt={endsAt} startedAt={startedAt} size="compact" />
        </div>
        <button
          aria-label="Terminer le cours"
          className="shrink-0 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-black text-red-300 hover:bg-red-500/20"
          onClick={() => setShowEndConfirm(true)}
          type="button"
        >
          ✕
        </button>
      </header>

      {/* ── Scrollable main ────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#4b5563 transparent" }}>

        {/* Mini PDF preview + navigation */}
        <div className="border-b border-gray-800 px-3 py-3">
          <p className="mb-2 text-center text-xs font-black uppercase tracking-widest text-gray-500">
            {totalPages > 0 ? `Page ${currentPage} / ${totalPages}` : "Chargement…"}
          </p>
          <div className="flex justify-center">
            {pdfUrl && totalPages > 0 ? (
              <MiniPdfPreview pdfUrl={pdfUrl} pageNumber={currentPage} />
            ) : (
              <div className="h-44 w-full animate-pulse rounded-lg bg-gray-800" />
            )}
          </div>
          <div className="mt-3 flex flex-col items-center gap-2">
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
        <div className="border-b border-gray-800 px-3 py-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-widest text-gray-500">
              Questions ({suggestedQuestions.length})
            </p>
            {aiGenAttempts < MAX_AI_ATTEMPTS ? (
              <button
                className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs font-semibold text-orange-300 transition-colors hover:bg-orange-500/20 disabled:opacity-60"
                disabled={isLoadingQuestions}
                onClick={handleGenerateAI}
                type="button"
              >
                {isLoadingQuestions ? "…" : "⚡ Générer avec IA"}
              </button>
            ) : (
              <span className="text-xs text-gray-500">IA ({MAX_AI_ATTEMPTS}/{MAX_AI_ATTEMPTS})</span>
            )}
          </div>

          {isLoadingQuestions ? (
            <div className="space-y-2">
              <div className="h-16 animate-pulse rounded-xl bg-gray-800" />
              <div className="h-16 animate-pulse rounded-xl bg-gray-800" />
            </div>
          ) : suggestedQuestions.length === 0 ? (
            <p className="py-2 text-center text-xs text-gray-600">
              {aiGenAttempts >= MAX_AI_ATTEMPTS
                ? "Génération IA indisponible · Utilise tes questions de la banque pour ce passage"
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
                    className={isThisActive && !isThisProjected ? "border-purple-500/50 ring-1 ring-purple-500/30" : undefined}
                    correctAnswerLetter={String.fromCharCode(65 + q.answer_index)}
                    isProjecting={isThisProjecting}
                    key={q.id}
                    onClick={() => handleProjectQuestion(q)}
                    options={q.options.map((text, i) => ({ letter: String.fromCharCode(65 + i), text }))}
                    origin={q.origin}
                    pageRange={q.page_range_start != null ? { start: q.page_range_start, end: q.page_range_end! } : undefined}
                    questionId={q.id}
                    questionText={q.question}
                    size="compact"
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Random pick CTA */}
        {hasClass ? (
          <div className="border-b border-gray-800 px-3 py-4">
            <button
              aria-busy={isPickLoading}
              aria-label="Tirer un élève au hasard"
              className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-purple-500 py-4 text-base font-black text-white shadow-lg shadow-purple-950/30 transition-opacity active:opacity-80 disabled:opacity-60"
              disabled={isPickLoading}
              onClick={handleRandomPick}
              type="button"
            >
              {isPickLoading ? "Tirage…" : "🎲 Tirer un élève"}
            </button>
          </div>
        ) : null}

        {/* Attendance list */}
        {members.length > 0 ? (
          <div className="px-3 pb-4 pt-3">
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-500">
              Présences ({members.length})
            </p>
            <div className="space-y-0.5">
              {members.map((m) => (
                <div className="flex items-center gap-2" key={m.student_user_id}>
                  <div className="min-w-0 flex-1">
                    <AttendanceRow
                      onChange={(s) => onAttendanceChange(m.student_user_id, s)}
                      size="compact"
                      status={attendance[m.student_user_id] ?? "present"}
                      studentId={m.student_user_id}
                      studentName={m.display_name}
                    />
                  </div>
                  <StudentPickBadge
                    pickCount={pickCounts[m.student_user_id] ?? 0}
                    size="compact"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-gray-800 bg-gray-900/80 px-3 py-3">
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
        description="L'écran de classe affichera « Cours terminé » et la session sera fermée."
        isOpen={showEndConfirm}
        onCancel={() => setShowEndConfirm(false)}
        onConfirm={onEnd}
        title="Terminer le cours live ?"
        variant="destructive"
      />

      {showPickAnimation && pickedStudent && pickCandidates.length > 0 ? (
        <RandomPickAnimation
          candidates={pickCandidates}
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
    </div>
  );
}

export default TeacherCockpitMobile;
