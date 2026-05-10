"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMicCapture } from "@/hooks/useMicCapture";
import { MicPermissionModal } from "@/components/listen/MicPermissionModal";
import { ListeningIndicator } from "@/components/ui/ListeningIndicator";
import { UnsupportedBrowserNotice } from "@/components/ui/UnsupportedBrowserNotice";
import { ContextualQuestionCard } from "@/components/ui/ContextualQuestionCard";
import type { ContextualQuestion } from "@/lib/contextual-questions";

const MAX_SUGGESTIONS = 6;
const COOLDOWN_MS = 20_000;
const INTERVAL_MS = 90_000;

type ListenSuggestion = {
  id: string;
  question: string;
  options: string[];
  answer_index: number;
  explanation: string | null;
  concept_page_hint: number | null;
};

type Props = {
  liveSessionId: string;
  currentPageNumber: number;
  onProjectQuestion: (question: ContextualQuestion) => void;
};

function mapToContextualQuestion(s: ListenSuggestion): ContextualQuestion {
  return {
    id: s.id,
    question: s.question,
    options: s.options,
    answer_index: s.answer_index,
    explanation: s.explanation,
    origin: "ai_listen",
    page_range_start: s.concept_page_hint,
    page_range_end: s.concept_page_hint,
  };
}

export function ListenSection({ liveSessionId, currentPageNumber, onProjectQuestion }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ContextualQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(INTERVAL_MS / 1000);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [emptyBufferMsg, setEmptyBufferMsg] = useState<string | null>(null);
  const [projectedIds, setProjectedIds] = useState(new Set<string>());

  const lastFlushAtRef = useRef<number | null>(null);
  const lastTriggerAtRef = useRef<number | null>(null);
  const currentPageRef = useRef(currentPageNumber);
  const emptyMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { currentPageRef.current = currentPageNumber; }, [currentPageNumber]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (emptyMsgTimerRef.current) clearTimeout(emptyMsgTimerRef.current);
    };
  }, []);

  const handleError = useCallback((error: string) => {
    if (error === "no-speech" || error === "aborted") return;
    if (error === "not-allowed" || error === "service-not-allowed" || error === "audio-capture") {
      setPermissionDenied(true);
    } else {
      setGenericError("Erreur audio — réactive pour réessayer");
      console.warn("[ListenSection] mic error:", error);
    }
  }, []);

  const postSuggestions = useCallback(async (transcript: string) => {
    const page = currentPageRef.current;
    lastFlushAtRef.current = Date.now();
    lastTriggerAtRef.current = Date.now();
    setCountdown(INTERVAL_MS / 1000);
    setCooldownRemaining(COOLDOWN_MS / 1000);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/live-sessions/${liveSessionId}/listen-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, pageNumber: page }),
      });
      if (!res.ok) return; // 429 or server error — silently ignore
      const data = await res.json() as { suggestions: ListenSuggestion[] };
      const mapped = (data.suggestions ?? []).map(mapToContextualQuestion);
      if (mapped.length > 0) {
        setSuggestions((prev) => [...mapped, ...prev].slice(0, MAX_SUGGESTIONS));
      }
    } catch {
      // network error — noop
    } finally {
      setIsLoading(false);
    }
  }, [liveSessionId]);

  const { isSupported, isListening, start, stop, triggerNow, bufferText } = useMicCapture({
    onBufferReady: postSuggestions,
    onError: handleError,
    intervalMs: INTERVAL_MS,
  });

  // Countdown + cooldown ticker (1s) while listening
  useEffect(() => {
    if (!isListening) return;
    const tick = setInterval(() => {
      const now = Date.now();
      if (lastFlushAtRef.current !== null) {
        const elapsed = (now - lastFlushAtRef.current) / 1000;
        setCountdown(Math.max(0, Math.round(INTERVAL_MS / 1000 - elapsed)));
      }
      if (lastTriggerAtRef.current !== null) {
        const elapsed = (now - lastTriggerAtRef.current) / 1000;
        setCooldownRemaining(Math.max(0, Math.round(COOLDOWN_MS / 1000 - elapsed)));
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [isListening]);

  function showEmptyBufferMsg() {
    setEmptyBufferMsg("Schoolio n'a pas encore capté assez de contenu, parle encore un peu");
    if (emptyMsgTimerRef.current) clearTimeout(emptyMsgTimerRef.current);
    emptyMsgTimerRef.current = setTimeout(() => setEmptyBufferMsg(null), 3000);
  }

  function handleActivate() {
    setPermissionDenied(false);
    setGenericError(null);
    setIsModalOpen(true);
  }

  function handleModalActivate() {
    setIsModalOpen(false);
    lastFlushAtRef.current = Date.now();
    setCountdown(INTERVAL_MS / 1000);
    start();
  }

  function handleStop() {
    stop();
    // Suggestions remain visible intentionally
  }

  function handleTriggerNow() {
    if (cooldownRemaining > 0 || isLoading) return;
    if (!bufferText.trim()) {
      showEmptyBufferMsg();
      return;
    }
    lastTriggerAtRef.current = Date.now();
    setCooldownRemaining(COOLDOWN_MS / 1000);
    triggerNow();
  }

  function handleProjectQuestion(q: ContextualQuestion) {
    setProjectedIds((prev) => new Set([...prev, q.id]));
    onProjectQuestion(q);
  }

  // ── Unsupported browser ───────────────────────────────────────────────────────
  if (!isSupported) {
    return (
      <div className="border-b border-gray-800 px-3 py-4">
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-500">
          🎙️ Schoolio écoute
        </p>
        <UnsupportedBrowserNotice feature="Schoolio écoute" />
      </div>
    );
  }

  return (
    <>
      <MicPermissionModal
        isOpen={isModalOpen}
        onActivate={handleModalActivate}
        onDismiss={() => setIsModalOpen(false)}
      />

      <div className="border-b border-gray-800 px-3 py-4">
        {/* Section header */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isListening && <ListeningIndicator position="inline" size="sm" />}
            <p className="text-xs font-black uppercase tracking-widest text-gray-500">
              🎙️ Schoolio écoute
              {suggestions.length > 0 && (
                <span className="ml-1.5 font-normal normal-case text-gray-600">
                  ({suggestions.length})
                </span>
              )}
            </p>
          </div>

          {/* Activate / stop button */}
          {!isListening ? (
            <button
              onClick={handleActivate}
              type="button"
              className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-300 transition-colors hover:bg-purple-500/20"
            >
              {permissionDenied
                ? "🚫 Permission refusée — Réactiver"
                : genericError
                  ? "⚠️ Réactiver"
                  : "🎙️ Activer Schoolio écoute"}
            </button>
          ) : (
            <button
              onClick={handleStop}
              type="button"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20"
            >
              🔴 En écoute — Désactiver
            </button>
          )}
        </div>

        {/* Active listening controls */}
        {isListening && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-600">
              ⏱️ Prochaine suggestion dans{" "}
              <span className="tabular-nums text-gray-500">{countdown}s</span>
            </span>
            <button
              onClick={handleTriggerNow}
              disabled={cooldownRemaining > 0 || isLoading}
              type="button"
              className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading
                ? "…"
                : cooldownRemaining > 0
                  ? `Patiente ${cooldownRemaining}s`
                  : "🤔 Suggérer maintenant"}
            </button>
          </div>
        )}

        {/* Empty buffer message */}
        {emptyBufferMsg && (
          <p className="mb-2 text-sm italic text-gray-400">{emptyBufferMsg}</p>
        )}

        {/* Generic error */}
        {genericError && !isListening && (
          <p className="mb-2 text-xs text-amber-400">{genericError}</p>
        )}

        {/* Suggestions list */}
        {suggestions.length === 0 ? (
          isListening ? (
            <p className="py-1 text-center text-xs text-gray-600">
              {isLoading ? "Analyse en cours…" : "En écoute · les suggestions apparaîtront ici"}
            </p>
          ) : null
        ) : (
          <div className="space-y-2">
            {suggestions.map((q, i) => (
              <div
                key={q.id}
                className="animate-fade-slide-down"
                style={{ animationDelay: `${i === 0 ? 0 : 0}ms` }}
              >
                <ContextualQuestionCard
                  questionId={q.id}
                  questionText={q.question}
                  options={q.options.map((text, idx) => ({
                    letter: String.fromCharCode(65 + idx),
                    text,
                  }))}
                  correctAnswerLetter={String.fromCharCode(65 + q.answer_index)}
                  origin={q.origin}
                  pageRange={
                    q.page_range_start !== null
                      ? { start: q.page_range_start, end: q.page_range_end! }
                      : undefined
                  }
                  alreadyProjected={projectedIds.has(q.id)}
                  onClick={() => handleProjectQuestion(q)}
                  size="compact"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default ListenSection;
