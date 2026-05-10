"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API types not in the default TS lib for all targets
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition | undefined;
    webkitSpeechRecognition: typeof SpeechRecognition | undefined;
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

  const recognitionRef = useRef<SpeechRecognition | null>(null);
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

  const createRecognition = useCallback((): SpeechRecognition | null => {
    const SpeechRecognitionImpl =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) return null;

    const rec = new SpeechRecognitionImpl();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: SpeechRecognitionEvent) => {
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

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // not-allowed = permission denied; no-speech = silence timeout (Chrome)
      if (event.error === "not-allowed") {
        onError("Accès au microphone refusé. Autorise le micro dans les paramètres du navigateur.");
        setIsListening(false);
        isListeningRef.current = false;
      } else if (event.error !== "no-speech") {
        onError(`Erreur microphone : ${event.error}`);
      }
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
    } catch {
      onError("Impossible de démarrer la reconnaissance vocale.");
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
