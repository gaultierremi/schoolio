"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const segmentsRef = useRef<BufferSegment[]>([]);
  const intervalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isListeningRef = useRef(false);

  const isSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  // Keep ref in sync so callbacks always see latest value
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

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

  const createRecognition = useCallback((): ISpeechRecognition | null => {
    const SpeechRecognitionImpl =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) return null;

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
      // Stop listening on permission denial so the consumer can reflect the state
      if (event.error === "not-allowed") {
        setIsListening(false);
        isListeningRef.current = false;
      }
      // Always forward the raw error code; consumer classifies and filters
      onError(event.error);
    };

    rec.onend = () => {
      // Chrome stops recognition after ~60s of inactivity; reconnect if still intended to listen
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

    return rec;
  }, [onError]);

  const start = useCallback(() => {
    if (!isSupported) {
      onError("Web Speech API non supportée par ce navigateur (utilisez Chrome ou Edge).");
      return;
    }
    if (isListeningRef.current) return;

    const rec = createRecognition();
    if (!rec) return;

    recognitionRef.current = rec;
    try {
      rec.start();
      setIsListening(true);
      isListeningRef.current = true;
      startIntervalTimer();
    } catch (e) {
      // Forward the actual exception message so debug logging surfaces the real cause.
      const msg = e instanceof Error ? `start-threw: ${e.message}` : "start-threw: unknown";
      onError(msg);
    }
  }, [isSupported, createRecognition, onError]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Reset the 90s interval so it doesn't fire again too soon
    startIntervalTimer();
  }, [flushBuffer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
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

  return { isSupported, isListening, start, stop, triggerNow, bufferText };
}
