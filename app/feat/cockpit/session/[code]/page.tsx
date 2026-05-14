"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { CockpitSession } from "@/types/post-course";
import { CockpitMobileAdapter } from "@/app/feat/cockpit/_components/CockpitMobileAdapter";

const HEARTBEAT_MS = 30_000;

export default function SessionPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [session, setSession] = useState<CockpitSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentPageRef = useRef(1);
  const scrollYRef = useRef(0);
  const zoomRef = useRef(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [listening, setListening] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pageDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bootstrap session
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/feat/cockpit/sessions/${code}`);
        if (!res.ok) {
          setError("Session introuvable ou expirée.");
          return;
        }
        const data = await res.json() as CockpitSession;
        setSession(data);
        setCurrentPage(data.current_page ?? 1);
        currentPageRef.current = data.current_page ?? 1;
      } catch {
        setError("Réseau indisponible.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [code]);

  // Heartbeat
  useEffect(() => {
    if (!session) return;
    heartbeatRef.current = setInterval(async () => {
      try {
        await fetch(`/api/feat/cockpit/sessions/${code}/page`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_page: currentPageRef.current }),
        });
      } catch {
        // non-blocking
      }
    }, HEARTBEAT_MS);
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [code, session]);

  // Debounced page-state sync
  function syncPageState() {
    if (pageDebounceRef.current) clearTimeout(pageDebounceRef.current);
    pageDebounceRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/feat/cockpit/sessions/${code}/page-state`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_page: currentPageRef.current,
            scroll_y: scrollYRef.current,
            zoom: zoomRef.current,
          }),
        });
      } catch {
        // non-blocking
      }
    }, 800);
  }

  function handlePageChange(page: number) {
    setCurrentPage(page);
    currentPageRef.current = page;
    syncPageState();
  }

  function handleZoomChange(z: number) {
    setZoom(z);
    zoomRef.current = z;
    syncPageState();
  }

  async function handleListenToggle(active: boolean) {
    setListening(active);
    try {
      await fetch(`/api/feat/cockpit/sessions/${code}/listen-toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
    } catch {
      // non-blocking
    }
  }

  async function handleEnd() {
    try {
      await fetch(`/api/feat/cockpit/sessions/${code}/end`, { method: "POST" });
    } catch {
      // non-blocking
    }
    router.push(`/feat/cockpit/end/${code}`);
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-stone-950 px-6 text-center">
        <p className="text-stone-300">{error ?? "Session introuvable."}</p>
        <a href="/feat/cockpit" className="text-sm text-violet-400 underline">
          Retour au cockpit
        </a>
      </div>
    );
  }

  return (
    <CockpitMobileAdapter
      sessionCode={code}
      currentPage={currentPage}
      totalPages={session.total_pages ?? 0}
      zoom={zoom}
      listening={listening}
      onPageChange={handlePageChange}
      onZoomChange={handleZoomChange}
      onEnd={handleEnd}
      onListenToggle={handleListenToggle}
    />
  );
}
