"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

// ── Types ─────────────────────────────────────────────────────────────────────

type SlaveState = "loading" | "active" | "ended" | "error";

type SessionSnapshot = {
  id: string;
  code: string;
  current_page: number;
  total_pages: number | null;
  ended_at: string | null;
};

// ── Slave page ────────────────────────────────────────────────────────────────

export default function SlavePage() {
  const { code } = useParams<{ code: string }>();

  const [slaveState, setSlaveState] = useState<SlaveState>("loading");
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const sessionIdRef = useRef<string | null>(null);

  // Online/offline detection
  useEffect(() => {
    function handleOffline() { setIsOffline(true); }
    function handleOnline() { setIsOffline(false); }
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  // Bootstrap: fetch session + PDF URL
  useEffect(() => {
    const upperCode = code.toUpperCase();

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
        setPdfUrl(pdfData.url);
        setSlaveState("active");
      } catch {
        setErrorMessage("Erreur réseau");
        setSlaveState("error");
      }
    }

    bootstrap();
  }, [code]);

  // Realtime subscription to live_sessions via postgres_changes
  useEffect(() => {
    if (slaveState !== "active" || !sessionId) return;

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
          const row = payload.new as SessionSnapshot;
          if (row.ended_at) {
            setSlaveState("ended");
            supabase.removeChannel(channel);
            return;
          }
          if (typeof row.current_page === "number") {
            setCurrentPage(row.current_page);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [slaveState, sessionId]);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (slaveState === "loading") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 text-white">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-700 border-t-purple-500" />
        <p className="text-sm text-gray-400">Connexion au cours…</p>
      </main>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (slaveState === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-4 text-center text-white">
        <p className="text-4xl">❌</p>
        <h1 className="text-xl font-black">Session introuvable</h1>
        <p className="text-sm text-gray-400">{errorMessage ?? "Vérifiez le code et réessayez."}</p>
      </main>
    );
  }

  // ── Ended ─────────────────────────────────────────────────────────────────

  if (slaveState === "ended") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-4 text-center text-white">
        <p className="text-4xl">✅</p>
        <h1 className="text-xl font-black">Cours terminé</h1>
        <p className="text-sm text-gray-400">Le professeur a mis fin à la session.</p>
      </main>
    );
  }

  // ── Active — full-screen PDF ───────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-black">
      {isOffline && (
        <div className="z-50 flex shrink-0 items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-sm font-black text-gray-950">
          <span className="animate-pulse">●</span>
          Reconnexion en cours…
        </div>
      )}
      {pdfUrl ? (
        <iframe
          key={currentPage}
          className="h-full w-full border-0"
          src={`${pdfUrl}#page=${currentPage}&toolbar=0&navpanes=0&scrollbar=0`}
          title="Cours live"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-gray-500">
          Chargement du PDF…
        </div>
      )}
    </div>
  );
}
