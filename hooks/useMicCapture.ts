"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMicPermission } from "@/hooks/useMicPermission";
import type { MicPermissionState } from "@/hooks/useMicPermission";

// Web Speech API — experimental, not in the standard TS DOM lib; declared manually.
interface ISpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface ISpeechRecognitionResult {
  readonly length: number;
  isFinal: boolean;
  item(index: number): ISpeechRecognitionAlternative;
  [index: number]: ISpeechRecognitionAlternative;
}

interface ISpeechRecognitionResultList {
  readonly length: number;
  item(index: number): ISpeechRecognitionResult;
  [index: number]: ISpeechRecognitionResult;
}

interface ISpeechRecognitionEvent extends Event {
  results: ISpeechRecognitionResultList;
  resultIndex: number;
}

interface ISpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface ISpeechRecognitionConstructor {
  new(): ISpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition: ISpeechRecognitionConstructor | undefined;
    webkitSpeechRecognition: ISpeechRecognitionConstructor | undefined;
  }
}

const BUFFER_WINDOW_MS = 90_000;
const RECONNECT_DELAY_MS = 200;

type BufferSegment = {
  text: string;
  timestamp: number;
};

type UseMicCaptureOptions = {
  onBufferReady: (transcript: string) => void;
  onError: (error: string) => void;
  intervalMs?: number;
};

type UseMicCaptureReturn = {
  isSupported: boolean;
  isListening: boolean;
  permissionState: MicPermissionState;
  refreshPermission: () => void;
  start: () => void;
  stop: () => void;
  triggerNow: () => void;
  bufferText: string;
};

export function useMicCapture({
  onBufferReady,
  onError,
  intervalMs = BUFFER_WINDOW_MS,
}: UseMicCaptureOptions): UseMicCaptureReturn {
  const [isListening, setIsListening] = useState(false);
  const [bufferText, setBufferText] = useState("");

  const { state: permissionState, refresh: refreshPermission, reportNotAllowed } = useMicPermission();

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const segmentsRef = useRef<BufferSegment[]>([]);
  const intervalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isListeningRef = useRef(false);
  // Guards against concurrent getUserMedia calls (e.g. double-tap on Android).
  const isRequestingRef = useRef(false);
  // Mirror of permissionState in a ref so onerror callbacks always see the latest value.
  const permissionStateRef = useRef<MicPermissionState>(permissionState);

  const isSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    permissionStateRef.current = permissionState;
  }, [permissionState]);

  function getRollingTranscript(): string {
    const cutoff = Date.now() - BUFFER_WINDOW_MS;
    return segmentsRef.current
      .filter((s) => s.timestamp >= cutoff)
      .map((s) => s.text)
      .join(" ")
      .trim();
  }

  function pruneOldSegments() {
    const cutoff = Date.now() - BUFFER_WINDOW_MS;
    segmentsRef.current = segmentsRef.current.filter((s) => s.timestamp >= cutoff);
  }

  const flushBuffer = useCallback(() => {
    pruneOldSegments();
    const transcript = getRollingTranscript();
    if (transcript.length > 0) {
      onBufferReady(transcript);
      segmentsRef.current = [];
      setBufferText("");
    }
  }, [onBufferReady]);

  function startIntervalTimer() {
    if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
    intervalTimerRef.current = setInterval(flushBuffer, intervalMs);
  }

  const launchRecognition = useCallback(() => {
    const SpeechRecognitionImpl =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) return;

    const rec = new SpeechRecognitionImpl();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: ISpeechRecognitionEvent) => {
      if (!event.results?.length) return;
      const lastResult = event.results[event.results.length - 1];
      if (!lastResult?.[0]) return;

      const text = lastResult[0].transcript;
      if (lastResult.isFinal && text.trim()) {
        segmentsRef.current.push({ text: text.trim(), timestamp: Date.now() });
        pruneOldSegments();
        setBufferText(getRollingTranscript());
      }
    };

    rec.onerror = (event: ISpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        setIsListening(false);
        isListeningRef.current = false;
        // Delegate to useMicPermission — it re-queries to distinguish 'dismissed' vs 'denied'.
        reportNotAllowed();
      }
      onError(event.error);
    };

    rec.onend = () => {
      if (isListeningRef.current) {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (isListeningRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {
              // already started or aborted — ignore
            }
          }
        }, RECONNECT_DELAY_MS);
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setIsListening(true);
      isListeningRef.current = true;
      startIntervalTimer();
    } catch (e) {
      const msg = e instanceof Error ? `start-threw: ${e.message}` : "start-threw: unknown";
      onError(msg);
    }
  }, [reportNotAllowed, onError]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(() => {
    if (!isSupported) {
      onError("Web Speech API non supportée par ce navigateur (utilisez Chrome ou Edge).");
      return;
    }
    if (isListeningRef.current) return;
    if (isRequestingRef.current) return;

    const pState = permissionStateRef.current;

    // Permission explicitly denied — don't attempt, surface the state for the UI.
    if (pState === "denied") {
      onError("not-allowed");
      return;
    }

    // Permission already granted or permissions API unavailable — start directly.
    if (pState === "granted" || pState === "unsupported") {
      launchRecognition();
      return;
    }

    // pState === 'prompt' | 'dismissed':
    // Must call getUserMedia from inside a gesture handler to trigger the browser popup.
    // We stop the stream immediately after — we only need it to request permission;
    // SpeechRecognition acquires its own mic track once started.
    isRequestingRef.current = true;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        isRequestingRef.current = false;
        launchRecognition();
      })
      .catch((err: unknown) => {
        isRequestingRef.current = false;
        const code =
          err instanceof DOMException
            ? (err.name === "NotAllowedError" ? "not-allowed" : err.name)
            : "getUserMedia-failed";
        // Let useMicPermission re-query so 'dismissed' vs 'denied' is set canonically.
        reportNotAllowed();
        onError(code);
      });
  }, [isSupported, launchRecognition, reportNotAllowed, onError]);

  const stop = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);

    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // already stopped
      }
      recognitionRef.current = null;
    }

    segmentsRef.current = [];
    setBufferText("");
  }, []);

  const triggerNow = useCallback(() => {
    flushBuffer();
    startIntervalTimer();
  }, [flushBuffer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    permissionState,
    refreshPermission,
    start,
    stop,
    triggerNow,
    bufferText,
  };
}
