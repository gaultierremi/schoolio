"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { Mic, Square } from "lucide-react";

export type BetaFeedbackPayload = {
  transcript: string;
  page: string;
  duration: number;
};

export type BetaFeedbackOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: BetaFeedbackPayload) => void;
};

const MOCK_TRANSCRIPT =
  "Ceci est un transcript de test. Adrien dit que le bouton X n'est pas visible sur Android.";

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

export default function BetaFeedbackOverlay({
  isOpen,
  onClose,
  onSubmit,
}: BetaFeedbackOverlayProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [page, setPage] = useState("/");

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPage(window.location.pathname || "/");
    setIsRecording(false);
    setDuration(0);
    setTranscript("");

    window.setTimeout(() => startButtonRef.current?.focus(), 0);

    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isRecording) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setDuration((current) => current + 1);
    }, 1000);

    const transcriptTimeoutId = window.setTimeout(() => {
      setTranscript(MOCK_TRANSCRIPT);
      setIsRecording(false);
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(transcriptTimeoutId);
    };
  }, [isOpen, isRecording]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleToggleRecording() {
    if (isRecording) {
      setIsRecording(false);
      if (!transcript) {
        setTranscript(MOCK_TRANSCRIPT);
      }
      return;
    }

    setDuration(0);
    setTranscript("");
    setIsRecording(true);
  }

  function handleSubmit() {
    const payload = {
      transcript,
      page,
      duration,
    };

    console.log(payload);
    onSubmit(payload);
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") {
      return;
    }

    const focusableCandidates: Array<HTMLElement | null> = [
      startButtonRef.current,
      textareaRef.current,
      cancelButtonRef.current,
      submitButtonRef.current,
    ];
    const focusable = focusableCandidates.filter(
      (element): element is HTMLElement => Boolean(element && !element.hasAttribute("disabled")),
    );

    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-5 text-white shadow-2xl shadow-black/40 sm:p-6"
      >
        <header className="flex items-start gap-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-200"
            aria-hidden="true"
          >
            <Mic className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-bold text-white">
              Envoie un retour vocal à l'équipe Schoolio
            </h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-gray-400">
              Page : <span className="font-mono text-gray-200">{page}</span>
            </p>
          </div>
        </header>

        <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              ref={startButtonRef}
              type="button"
              onClick={handleToggleRecording}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 py-2.5 text-sm font-bold text-gray-950 transition hover:bg-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-950"
            >
              {isRecording ? (
                <>
                  <Square className="h-4 w-4 fill-current" />
                  Arrêter
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  Démarrer l'enregistrement
                </>
              )}
            </button>

            <div className="flex items-center gap-3 text-sm text-gray-300">
              <span
                className={`h-3 w-3 rounded-full ${
                  isRecording ? "animate-pulse bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.8)]" : "bg-gray-700"
                }`}
                aria-hidden="true"
              />
              <span className="font-mono tabular-nums">{formatDuration(duration)}</span>
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="Le transcript de test apparaîtra ici après le faux enregistrement."
            className="mt-4 min-h-32 w-full resize-none rounded-xl border border-gray-800 bg-gray-950 px-3 py-3 text-sm leading-6 text-gray-100 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30"
          />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-gray-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            Annuler
          </button>
          <button
            ref={submitButtonRef}
            type="button"
            onClick={handleSubmit}
            disabled={!transcript.trim()}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-purple-500 px-4 py-2.5 text-sm font-bold text-gray-950 transition hover:bg-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Envoyer le retour
          </button>
        </div>
      </section>
    </div>
  );
}
