"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

// ── react-pdf — client-only ─────────────────────────────────────────────────
const LivePdfViewer = dynamic(
  () => import("@/components/pdf/LivePdfViewer").then((m) => m.LivePdfViewer),
  { ssr: false },
);

// ── Types ───────────────────────────────────────────────────────────────────

type SlaveState = "loading" | "active" | "ended" | "error";

type DisplayMode = "pdf" | "question" | "answer";

type SessionSnapshot = {
  id: string;
  code: string;
  current_page: number;
  scroll_y: number;
  zoom: number;
  ended_at: string | null;
  projected_question_id: string | null;
  show_answer: boolean;
};

type ProjectedOption = {
  letter: string;
  text: string;
  is_correct?: boolean;
};

type ProjectedQuestion = {
  projected: true;
  id: string;
  question: string;
  options: ProjectedOption[];
  page_range_start: number | null;
  page_range_end: number | null;
  origin: string;
  show_answer: boolean;
  correct_answer_letter?: string;
  explanation?: string | null;
};

type ProjectedQuestionResponse = { projected: false } | ProjectedQuestion;

// ── Helpers ─────────────────────────────────────────────────────────────────

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getOriginLabel(origin: string) {
  if (origin === "ai_live") return "⚡ Généré en live";
  if (origin === "extracted_from_pdf") return "📄 Extrait du cours";
  return "🤖 IA";
}

// ── Question overlay — full-screen classroom display ────────────────────────

function QuestionDisplay({
  question,
  mode,
}: {
  question: ProjectedQuestion;
  mode: "question" | "answer";
}) {
  const isAnswer = mode === "answer";

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-950 px-8 py-12">
      {/* Header bar */}
      <div className="mb-8 flex w-full max-w-4xl items-center justify-between">
        <span className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-sm font-medium text-purple-300">
          {getOriginLabel(question.origin)}
        </span>
        {question.page_range_start != null ? (
          <span className="text-sm text-gray-500">
            p. {question.page_range_start}
            {question.page_range_end !== question.page_range_start
              ? `–${question.page_range_end}`
              : ""}
          </span>
        ) : null}
      </div>

      {/* Question text */}
      <div className="mb-10 w-full max-w-4xl">
        <p className="text-center text-3xl font-black leading-tight text-white">
          {question.question}
        </p>
      </div>

      {/* Options grid */}
      <div className="grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
        {question.options.map((opt) => {
          const isCorrect = isAnswer && opt.is_correct === true;
          const isWrong = isAnswer && opt.is_correct === false;
          return (
            <div
              className={cx(
                "flex items-center gap-4 rounded-2xl border-2 px-5 py-4 transition-colors",
                isCorrect
                  ? "border-green-400/60 bg-green-500/15 shadow-lg shadow-green-950/30"
                  : isWrong
                    ? "border-gray-700/40 bg-gray-900/40 opacity-50"
                    : "border-gray-700 bg-gray-900",
              )}
              key={opt.letter}
            >
              <span
                className={cx(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-lg font-black",
                  isCorrect
                    ? "border-green-400/60 bg-green-500/20 text-green-300"
                    : "border-gray-600 bg-gray-800 text-gray-300",
                )}
              >
                {opt.letter}
              </span>
              <span
                className={cx(
                  "text-xl font-semibold leading-snug",
                  isCorrect ? "text-green-100" : isWrong ? "text-gray-600" : "text-gray-100",
                )}
              >
                {opt.text}
              </span>
              {isCorrect ? (
                <span className="ml-auto shrink-0 text-2xl text-green-400">✓</span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Explanation (answer mode only) */}
      {isAnswer && question.explanation ? (
        <div className="mt-8 w-full max-w-4xl rounded-2xl border border-blue-500/20 bg-blue-500/5 px-6 py-4">
          <p className="text-center text-base text-blue-200">
            <span className="font-bold">Explication : </span>
            {question.explanation}
          </p>
        </div>
      ) : null}

      {/* Waiting indicator (question mode) */}
      {!isAnswer ? (
        <p className="mt-10 text-sm text-gray-600">En attente de la réponse du professeur…</p>
      ) : null}
    </div>
  );
}

// ── Slave page ───────────────────────────────────────────────────────────────

export default function SlavePage() {
  const { code } = useParams<{ code: string }>();

  const [slaveState, setSlaveState] = useState<SlaveState>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Viewport state — driven by Realtime
  const [currentPage, setCurrentPage] = useState(1);
  const [scrollY, setScrollY] = useState(0);
  const [zoom, setZoom] = useState(1.0);

  // Question projection state
  const [displayMode, setDisplayMode] = useState<DisplayMode>("pdf");
  const [projectedQuestion, setProjectedQuestion] = useState<ProjectedQuestion | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const codeRef = useRef(code.toUpperCase());

  // Online/offline detection
  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const fetchProjectedQuestion = useCallback(async () => {
    const upperCode = codeRef.current;
    try {
      const res = await fetch(`/api/live/${upperCode}/projected-question`);
      if (!res.ok) return;
      const data = await res.json() as ProjectedQuestionResponse;
      if (!data.projected) {
        setProjectedQuestion(null);
        setDisplayMode("pdf");
        return;
      }
      setProjectedQuestion(data);
      setDisplayMode(data.show_answer ? "answer" : "question");
    } catch {
      // Non-blocking — will retry via poll
    }
  }, []);

  // Bootstrap: fetch session + PDF URL + initial projection state
  useEffect(() => {
    const upperCode = codeRef.current;

    async function bootstrap() {
      try {
        const sessionRes = await fetch(`/api/live/${upperCode}`);
        if (!sessionRes.ok) {
          const data = await sessionRes.json() as { error?: string };
          setErrorMessage(data.error ?? "Session introuvable");
          setSlaveState("error");
          return;
        }
        const session = await sessionRes.json() as SessionSnapshot;

        if (session.ended_at) {
          setSlaveState("ended");
          return;
        }

        const pdfRes = await fetch(`/api/live/${upperCode}/pdf-url`);
        if (!pdfRes.ok) {
          const data = await pdfRes.json() as { error?: string };
          setErrorMessage(data.error ?? "PDF introuvable");
          setSlaveState("error");
          return;
        }
        const pdfData = await pdfRes.json() as { url: string };

        sessionIdRef.current = session.id;
        setSessionId(session.id);
        setCurrentPage(session.current_page);
        setScrollY(session.scroll_y ?? 0);
        setZoom(session.zoom ?? 1.0);
        setPdfUrl(pdfData.url);
        setSlaveState("active");

        // Load initial projection state
        await fetchProjectedQuestion();
      } catch {
        setErrorMessage("Erreur réseau");
        setSlaveState("error");
      }
    }

    bootstrap();
  }, [code, fetchProjectedQuestion]);

  // Realtime — receive viewport + projection changes from master
  useEffect(() => {
    if (slaveState !== "active" || !sessionId) return;

    console.log("[Slave] Setting up Realtime subscription for session:", sessionId);

    const supabase = createClient();

    const channel = supabase
      .channel(`live-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "live_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          console.log("[Slave] Received Realtime UPDATE:", payload.new);
          const row = payload.new as SessionSnapshot;

          if (row.ended_at) {
            setSlaveState("ended");
            supabase.removeChannel(channel);
            return;
          }

          if (typeof row.current_page === "number") setCurrentPage(row.current_page);
          if (typeof row.scroll_y === "number") setScrollY(row.scroll_y);
          if (typeof row.zoom === "number") setZoom(row.zoom);

          // Projection state changed — re-fetch question details
          if (row.projected_question_id === null) {
            setProjectedQuestion(null);
            setDisplayMode("pdf");
          } else {
            fetchProjectedQuestion();
          }
        },
      )
      .subscribe((status, err) => {
        console.log("[Slave] Realtime status:", status, err ?? "");
      });

    return () => { supabase.removeChannel(channel); };
  }, [slaveState, sessionId, fetchProjectedQuestion]);

  // Resilience poll every 5s regardless of display mode.
  // Realtime handles instant updates; this catches any missed events.
  useEffect(() => {
    if (slaveState !== "active") return;
    pollRef.current = setInterval(fetchProjectedQuestion, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [slaveState, fetchProjectedQuestion]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (slaveState === "loading") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 text-white">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-700 border-t-purple-500" />
        <p className="text-sm text-gray-400">Connexion au cours…</p>
      </main>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (slaveState === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-4 text-center text-white">
        <p className="text-4xl">❌</p>
        <h1 className="text-xl font-black">Session introuvable</h1>
        <p className="text-sm text-gray-400">{errorMessage ?? "Vérifiez le code et réessayez."}</p>
      </main>
    );
  }

  // ── Ended ────────────────────────────────────────────────────────────────────
  if (slaveState === "ended") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-4 text-center text-white">
        <p className="text-4xl">✅</p>
        <h1 className="text-xl font-black">Cours terminé</h1>
        <p className="text-sm text-gray-400">Le professeur a mis fin à la session.</p>
      </main>
    );
  }

  // ── Active ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950">
      {isOffline ? (
        <div className="z-50 flex shrink-0 items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-sm font-black text-gray-950">
          <span className="animate-pulse">●</span>
          Reconnexion en cours…
        </div>
      ) : null}

      {/* ── Mode: question or answer (overlays PDF) ─────────────────────────── */}
      {(displayMode === "question" || displayMode === "answer") && projectedQuestion ? (
        <QuestionDisplay question={projectedQuestion} mode={displayMode} />
      ) : (
        /* ── Mode: pdf ────────────────────────────────────────────────────── */
        pdfUrl ? (
          <LivePdfViewer
            className="flex-1"
            currentPage={currentPage}
            mode="slave"
            pdfUrl={pdfUrl}
            scrollY={scrollY}
            zoom={zoom}
          />
        ) : null
      )}
    </div>
  );
}
