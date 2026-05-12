"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMicCapture } from "@/hooks/useMicCapture";
import { MicPermissionModal } from "@/components/listen/MicPermissionModal";
import { MicPermissionRecoveryModal } from "@/components/permissions/MicPermissionRecoveryModal";
import type { RecoveryReason } from "@/components/permissions/MicPermissionRecoveryModal";
import { ListeningIndicator } from "@/components/ui/ListeningIndicator";
import { UnsupportedBrowserNotice } from "@/components/ui/UnsupportedBrowserNotice";
import { ContextualQuestionCard } from "@/components/ui/ContextualQuestionCard";
import type { ContextualQuestion } from "@/lib/contextual-questions";

const MAX_SUGGESTIONS = 6;
const COOLDOWN_MS = 20_000;
const INTERVAL_MS = 90_000;
const HEARTBEAT_INTERVAL_MS = 10_000;

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

// ── On-screen debug panel ─────────────────────────────────────────────────────
// Active only when ?debug=1 is present in the URL.
// Usage: open the live session URL with ?debug=1 appended on Android, then tap
// the mic button — events appear in a fixed panel at the bottom of the screen.
// Remove via the × button or by reloading without ?debug=1.

function useDebugLog() {
  const isDebug = useRef(
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1",
  );
  const [entries, setEntries] = useState<string[]>([]);

  const log = useCallback((msg: string) => {
    if (!isDebug.current) return;
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    setEntries((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 30));
  }, []);

  return { isDebug: isDebug.current, entries, log };
}

function DebugPanel({ entries, onClear }: { entries: string[]; onClear: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.92)",
        borderTop: "1px solid #4b5563",
        maxHeight: "40vh",
        overflowY: "auto",
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#86efac",
        padding: "8px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#f9a8d4", fontWeight: "bold" }}>🎙️ debug (?debug=1)</span>
        <button
          onClick={onClear}
          style={{ color: "#9ca3af", background: "none", border: "none", cursor: "pointer" }}
        >
          × clear
        </button>
      </div>
      {entries.length === 0 ? (
        <div style={{ color: "#6b7280" }}>En attente d&apos;événements…</div>
      ) : (
        entries.map((e, i) => (
          <div key={i} style={{ borderBottom: "1px solid #1f2937", padding: "2px 0" }}>{e}</div>
        ))
      )}
    </div>
  );
}

export function ListenSection({ liveSessionId, currentPageNumber, onProjectQuestion }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [recoveryReason, setRecoveryReason] = useState<RecoveryReason>("denied");
  const [genericError, setGenericError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ContextualQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(INTERVAL_MS / 1000);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [emptyBufferMsg, setEmptyBufferMsg] = useState<string | null>(null);
  const [projectedIds, setProjectedIds] = useState(new Set<string>());
  const [generatedCount, setGeneratedCount] = useState(0);

  const lastFlushAtRef = useRef<number | null>(null);
  const lastTriggerAtRef = useRef<number | null>(null);
  const currentPageRef = useRef(currentPageNumber);
  const emptyMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isListeningRef = useRef(false);

  const { isDebug, entries: debugEntries, log: debugLog } = useDebugLog();
  const [debugVisible, setDebugVisible] = useState(true);

  useEffect(() => { currentPageRef.current = currentPageNumber; }, [currentPageNumber]);

  // Log environment on mount
  useEffect(() => {
    if (!isDebug) return;
    debugLog(`UA: ${navigator.userAgent.slice(0, 80)}`);
    debugLog(`SpeechRecognition: ${typeof window.SpeechRecognition}`);
    debugLog(`webkitSpeechRecognition: ${typeof window.webkitSpeechRecognition}`);
    debugLog(`navigator.mediaDevices: ${typeof navigator.mediaDevices}`);
    debugLog(`getUserMedia: ${typeof navigator.mediaDevices?.getUserMedia}`);
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((result) => debugLog(`permissions.query(mic): ${result.state}`))
        .catch((e: unknown) => debugLog(`permissions.query error: ${String(e)}`));
    } else {
      debugLog("navigator.permissions: undefined");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (emptyMsgTimerRef.current) clearTimeout(emptyMsgTimerRef.current);
    };
  }, []);

  // Cleanup on unmount: turn off listening in DB if still active (e.g. teacher navigates away).
  // keepalive: true ensures the request survives tab close.
  useEffect(() => {
    return () => {
      if (isListeningRef.current) {
        fetch(`/api/live-sessions/${liveSessionId}/listen-toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: false }),
          keepalive: true,
        }).catch(() => undefined);
      }
    };
  }, [liveSessionId]);

  const handleError = useCallback((error: string) => {
    debugLog(`onError: "${error}"`);
    if (error === "no-speech" || error === "aborted") return;
    if (error === "not-allowed" || error === "service-not-allowed" || error === "audio-capture") {
      // Recovery modal is opened via the permissionState effect below.
    } else {
      setGenericError("Erreur audio — réactive pour réessayer");
      console.warn("[ListenSection] mic error:", error);
    }
  }, [debugLog]);

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
        setGeneratedCount((n) => n + mapped.length);
      }
    } catch {
      // network error — noop
    } finally {
      setIsLoading(false);
    }
  }, [liveSessionId]);

  const {
    isSupported,
    isListening,
    permissionState,
    refreshPermission,
    start,
    stop,
    triggerNow,
    bufferText,
  } = useMicCapture({
    onBufferReady: postSuggestions,
    onError: handleError,
    intervalMs: INTERVAL_MS,
  });

  // Keep ref in sync so the unmount cleanup sees the latest value
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // When permission improves to 'granted' or resets to 'prompt', close the recovery modal and start.
  // 'prompt' happens when the user cleared site data entirely — getUserMedia inside start()
  // will re-trigger the browser popup from that clean state.
  useEffect(() => {
    if (
      (permissionState === "granted" || permissionState === "prompt") &&
      isRecoveryModalOpen
    ) {
      setIsRecoveryModalOpen(false);
      lastFlushAtRef.current = Date.now();
      setCountdown(INTERVAL_MS / 1000);
      start();
      fetch(`/api/live-sessions/${liveSessionId}/listen-toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      }).catch(() => undefined);
    }
  }, [permissionState]); // eslint-disable-line react-hooks/exhaustive-deps

  // When permission becomes denied/dismissed while not listening, surface the recovery modal.
  useEffect(() => {
    if (
      (permissionState === "denied" || permissionState === "dismissed") &&
      !isListening &&
      !isRecoveryModalOpen
    ) {
      setRecoveryReason(permissionState);
      setIsRecoveryModalOpen(true);
    }
  }, [permissionState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Heartbeat: refresh listening_heartbeat_at every 10 s while active.
  // Slave uses this to detect stale listening state after network loss (>15 s = stale).
  useEffect(() => {
    if (!isListening) {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      return;
    }
    heartbeatTimerRef.current = setInterval(() => {
      fetch(`/api/live-sessions/${liveSessionId}/listen-heartbeat`, {
        method: "POST",
      }).catch(() => undefined);
    }, HEARTBEAT_INTERVAL_MS);
    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };
  }, [isListening, liveSessionId]);

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
    debugLog(`handleActivate: permissionState=${permissionState}`);
    setGenericError(null);

    if (permissionState === "denied" || permissionState === "dismissed") {
      setRecoveryReason(permissionState);
      setIsRecoveryModalOpen(true);
      return;
    }

    if (permissionState === "granted") {
      // Skip modal — start immediately.
      lastFlushAtRef.current = Date.now();
      setCountdown(INTERVAL_MS / 1000);
      start();
      fetch(`/api/live-sessions/${liveSessionId}/listen-toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      }).catch(() => undefined);
      return;
    }

    // 'prompt' or 'unsupported' — show the initial info modal.
    setIsModalOpen(true);
  }

  function handleModalActivate() {
    debugLog("handleModalActivate: modal confirmed → calling start()");
    setIsModalOpen(false);
    lastFlushAtRef.current = Date.now();
    setCountdown(INTERVAL_MS / 1000);
    start();
    debugLog("handleModalActivate: start() returned");
    fetch(`/api/live-sessions/${liveSessionId}/listen-toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    }).catch(() => undefined);
  }

  async function handleStop() {
    stop();
    await fetch(`/api/live-sessions/${liveSessionId}/listen-toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    }).catch(() => undefined);
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
      <MicPermissionRecoveryModal
        isOpen={isRecoveryModalOpen}
        reason={recoveryReason}
        onRetry={() => {
          setIsRecoveryModalOpen(false);
          lastFlushAtRef.current = Date.now();
          setCountdown(INTERVAL_MS / 1000);
          start();
          fetch(`/api/live-sessions/${liveSessionId}/listen-toggle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: true }),
          }).catch(() => undefined);
        }}
        onRefresh={() => { refreshPermission(); }}
        onDismiss={() => setIsRecoveryModalOpen(false)}
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
              {(permissionState === "denied" || permissionState === "dismissed")
                ? "🚫 Micro bloqué — Configurer"
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

        {/* Generated count */}
        {generatedCount > 0 && (
          <p className="mb-2 text-xs text-gray-600">
            {generatedCount} question{generatedCount > 1 ? "s" : ""} générée{generatedCount > 1 ? "s" : ""} ce cours
          </p>
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

      {/* On-screen debug panel — visible only with ?debug=1 */}
      {isDebug && debugVisible && (
        <DebugPanel
          entries={debugEntries}
          onClear={() => setDebugVisible(false)}
        />
      )}
    </>
  );
}

export default ListenSection;
