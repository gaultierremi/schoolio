"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { AttendanceRow, type AttendanceStatus } from "@/components/ui/AttendanceRow";
import { PairingCodeDisplay } from "@/components/ui/PairingCodeDisplay";
import { LiveSessionTimer } from "@/components/ui/LiveSessionTimer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ── react-pdf uses canvas — must be client-only ───────────────────────────────
const LivePdfViewer = dynamic(
  () => import("@/components/pdf/LivePdfViewer").then((m) => m.LivePdfViewer),
  { ssr: false, loading: () => <PdfLoadingFallback /> },
);

function PdfLoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-gray-950 text-gray-500">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-purple-500" />
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ClassItem = { id: string; name: string; level: string | null; member_count: number };
type Member = { student_user_id: string; display_name: string };
type LiveSession = { id: string; code: string };
type MasterState = "class-select" | "starting" | "live" | "ended";

const SESSION_MAX_MS = 4 * 60 * 60 * 1000;
const PAGE_STATE_DEBOUNCE_MS = 200;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LiveMasterPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const router = useRouter();

  const [phase, setPhase] = useState<MasterState>("class-select");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [session, setSession] = useState<LiveSession | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Viewport state — controlled props for LivePdfViewer
  const [currentPage, setCurrentPage] = useState(1);
  const [scrollY, setScrollY] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [totalPages, setTotalPages] = useState(0);

  const sessionIdRef = useRef<string | null>(null);
  const classIdRef = useRef("");
  const pageStateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentPageRef = useRef(1);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  // Load classes
  useEffect(() => {
    fetch("/api/classes")
      .then((r) => r.json() as Promise<ClassItem[]>)
      .then((d) => setClasses(Array.isArray(d) ? d : []))
      .catch(() => setError("Impossible de charger les classes"));
  }, []);

  // beforeunload warning during live
  useEffect(() => {
    if (phase !== "live") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  // 30s heartbeat
  useEffect(() => {
    if (phase !== "live") return;
    heartbeatRef.current = setInterval(() => {
      const id = sessionIdRef.current;
      if (!id) return;
      fetch(`/api/live-sessions/${id}/page`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: currentPageRef.current }),
      });
    }, 30_000);
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [phase]);

  // Debounced PATCH page-state
  const patchPageState = useCallback((page: number, sy: number, z: number, immediate = false) => {
    const id = sessionIdRef.current;
    if (!id) return;
    if (pageStateDebounceRef.current) clearTimeout(pageStateDebounceRef.current);
    const doFetch = () =>
      fetch(`/api/live-sessions/${id}/page-state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_page: page, scroll_y: sy, zoom: z }),
      }).then(async (res) => {
        if (res.status === 410) { setSession(null); setPhase("ended"); }
      }).catch(() => undefined);
    if (immediate) { doFetch(); } else {
      pageStateDebounceRef.current = setTimeout(doFetch, PAGE_STATE_DEBOUNCE_MS);
    }
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    patchPageState(page, scrollY, zoom, true);
  }, [patchPageState, scrollY, zoom]);

  const handleScrollChange = useCallback((sy: number) => {
    setScrollY(sy);
    patchPageState(currentPage, sy, zoom);
  }, [patchPageState, currentPage, zoom]);

  const handleZoomChange = useCallback((z: number) => {
    setZoom(z);
    patchPageState(currentPage, scrollY, z);
  }, [patchPageState, currentPage, scrollY]);

  async function handleStart() {
    setPhase("starting");
    setError(null);
    try {
      const [sessionRes, urlRes] = await Promise.all([
        fetch("/api/live-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ course_id: courseId, class_id: selectedClassId || undefined }),
        }),
        fetch(`/api/courses/${courseId}/signed-url`),
      ]);
      const [sessionData, urlData] = await Promise.all([
        sessionRes.json() as Promise<{ id?: string; code?: string; error?: string }>,
        urlRes.json() as Promise<{ url?: string; error?: string }>,
      ]);
      if (!sessionRes.ok) throw new Error(sessionData.error ?? "Erreur création session");
      if (!urlRes.ok) throw new Error(urlData.error ?? "Erreur URL PDF");

      sessionIdRef.current = sessionData.id!;
      classIdRef.current = selectedClassId;

      if (selectedClassId) {
        const membersRes = await fetch(`/api/classes/${selectedClassId}/members`);
        const membersData = await membersRes.json() as Member[];
        if (Array.isArray(membersData)) {
          setMembers(membersData);
          const init: Record<string, AttendanceStatus> = {};
          membersData.forEach((m) => { init[m.student_user_id] = "present"; });
          setAttendance(init);
        }
      }

      setSession({ id: sessionData.id!, code: sessionData.code! });
      setPdfUrl(urlData.url!);
      setStartedAt(new Date());
      setPhase("live");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
      setPhase("class-select");
    }
  }

  function handleAttendanceChange(studentId: string, status: AttendanceStatus) {
    setAttendance((prev) => ({ ...prev, [studentId]: status }));
    if (!classIdRef.current) return;
    fetch(`/api/classes/${classIdRef.current}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        records: [{ student_user_id: studentId, status }],
      }),
    }).catch(() => undefined);
  }

  const handleRegenerate = useCallback(async () => {
    if (!session) return;
    const res = await fetch(`/api/live-sessions/${session.id}/regenerate-code`, { method: "POST" });
    const data = await res.json() as { code?: string };
    if (data.code) setSession((prev) => prev ? { ...prev, code: data.code! } : prev);
  }, [session]);

  async function handleEnd() {
    if (!session) return;
    await fetch(`/api/live-sessions/${session.id}/end`, { method: "POST" });
    setPhase("ended");
  }

  // ── Class-select / starting ───────────────────────────────────────────────────
  if (phase === "class-select" || phase === "starting") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 py-12 text-white">
        <div className="w-full max-w-md">
          <button onClick={() => router.back()} className="mb-6 text-sm font-bold text-gray-500 hover:text-purple-400">
            ← Retour
          </button>
          <h1 className="text-2xl font-black">Démarrer un cours live</h1>
          <p className="mt-1 text-sm text-gray-400">
            Choisissez une classe pour le suivi des présences, ou démarrez sans classe.
          </p>
          <div className="mt-6">
            <label className="text-xs font-black uppercase tracking-widest text-gray-500">
              Classe (optionnel)
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              disabled={phase === "starting"}
              className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="">Aucune classe (sans suivi)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.level ? ` — ${c.level}` : ""} ({c.member_count} élève{c.member_count !== 1 ? "s" : ""})
                </option>
              ))}
            </select>
          </div>
          {error && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
          <button
            onClick={handleStart}
            disabled={phase === "starting"}
            className="mt-6 w-full rounded-xl bg-purple-500 py-3 font-black text-gray-950 hover:bg-purple-400 disabled:opacity-50"
          >
            {phase === "starting" ? "Démarrage…" : "Démarrer le cours live"}
          </button>
        </div>
      </main>
    );
  }

  if (phase === "ended") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 text-white">
        <div className="text-center">
          <p className="text-5xl">✅</p>
          <h1 className="mt-4 text-2xl font-black">Cours terminé</h1>
          <p className="mt-2 text-gray-400">Les présences ont été enregistrées.</p>
          <button
            onClick={() => router.push(`/school/courses/${courseId}/exercises`)}
            className="mt-6 rounded-xl bg-purple-500 px-6 py-3 font-black text-gray-950 hover:bg-purple-400"
          >
            Retour au cours
          </button>
        </div>
      </main>
    );
  }

  // ── Live ──────────────────────────────────────────────────────────────────────
  const endsAt = startedAt
    ? new Date(startedAt.getTime() + SESSION_MAX_MS)
    : new Date(Date.now() + SESSION_MAX_MS);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-white">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-gray-800 bg-gray-900 px-3">
        <div className="flex min-w-0 items-center gap-3">
          {session && (
            <PairingCodeDisplay code={session.code} size="compact" onRegenerate={handleRegenerate} />
          )}
          {startedAt && (
            <LiveSessionTimer endsAt={endsAt} startedAt={startedAt} size="compact" />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {totalPages > 0 && (
            <span className="hidden text-xs text-gray-500 sm:block">
              {currentPage} / {totalPages}
            </span>
          )}
          <button
            onClick={() => setShowEndConfirm(true)}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300 hover:bg-red-500/20"
          >
            Terminer
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {members.length > 0 && (
          <aside className="flex w-1/5 min-w-[160px] flex-col overflow-y-auto border-r border-gray-800 bg-gray-900/50">
            <div className="px-2 py-3">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">Présences</p>
            </div>
            <div className="flex-1 space-y-0.5 px-1 pb-2">
              {members.map((m) => (
                <AttendanceRow
                  key={m.student_user_id}
                  studentId={m.student_user_id}
                  studentName={m.display_name}
                  status={attendance[m.student_user_id] ?? "present"}
                  onChange={(s) => handleAttendanceChange(m.student_user_id, s)}
                  size="compact"
                />
              ))}
            </div>
          </aside>
        )}

        {pdfUrl && (
          <LivePdfViewer
            pdfUrl={pdfUrl}
            currentPage={currentPage}
            scrollY={scrollY}
            zoom={zoom}
            mode="master"
            onPageChange={handlePageChange}
            onScrollChange={handleScrollChange}
            onZoomChange={handleZoomChange}
            onTotalPagesLoaded={setTotalPages}
            className="flex-1"
          />
        )}
      </div>

      <ConfirmDialog
        isOpen={showEndConfirm}
        title="Terminer le cours live ?"
        description="L'écran de classe affichera « Cours terminé » et la session sera fermée."
        confirmLabel="Terminer"
        onConfirm={handleEnd}
        onCancel={() => setShowEndConfirm(false)}
      />
    </div>
  );
}
