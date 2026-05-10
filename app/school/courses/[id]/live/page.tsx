"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AttendanceRow, type AttendanceStatus } from "@/components/ui/AttendanceRow";
import { PairingCodeDisplay } from "@/components/ui/PairingCodeDisplay";

// ── Types ─────────────────────────────────────────────────────────────────────

type ClassItem = {
  id: string;
  name: string;
  level: string | null;
  subject: string | null;
  member_count: number;
};

type Member = {
  student_user_id: string;
  display_name: string;
};

type LiveSession = {
  id: string;
  code: string;
  current_page: number;
  total_pages: number | null;
};

type MasterState = "class-select" | "starting" | "live" | "ended";

// ── Inline live timer ─────────────────────────────────────────────────────────

function LiveTimer({ startedAt }: { startedAt: Date }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;

  const label = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return (
    <span className="font-mono text-sm font-bold text-gray-400">
      {label}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LiveMasterPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const router = useRouter();

  const [state, setState] = useState<MasterState>("class-select");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [session, setSession] = useState<LiveSession | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const currentPageRef = useRef(1);
  const classIdRef = useRef<string>("");
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attendanceSyncRef = useRef<Record<string, AttendanceStatus>>({});

  // Load classes on mount
  useEffect(() => {
    fetch("/api/classes")
      .then((r) => r.json() as Promise<ClassItem[]>)
      .then((data) => setClasses(Array.isArray(data) ? data : []))
      .catch(() => setError("Impossible de charger les classes"));
  }, []);

  // Sync attendance ref
  useEffect(() => {
    attendanceSyncRef.current = attendance;
  }, [attendance]);

  // Sync page ref
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // beforeunload warning during live session
  useEffect(() => {
    if (state !== "live") return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [state]);

  // Heartbeat — PATCH current_page every 30s
  useEffect(() => {
    if (state !== "live") return;

    heartbeatRef.current = setInterval(async () => {
      const id = sessionIdRef.current;
      if (!id) return;
      await fetch(`/api/live-sessions/${id}/page`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: currentPageRef.current }),
      });
    }, 30_000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [state]);

  async function handleStart() {
    setState("starting");
    setError(null);

    try {
      // Create live session
      const sessionRes = await fetch("/api/live-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: courseId,
          class_id: selectedClassId || undefined,
        }),
      });
      const sessionData = await sessionRes.json() as { id?: string; code?: string; error?: string };
      if (!sessionRes.ok) throw new Error(sessionData.error ?? "Erreur création session");

      const newSession: LiveSession = {
        id: sessionData.id!,
        code: sessionData.code!,
        current_page: 1,
        total_pages: null,
      };
      sessionIdRef.current = newSession.id;
      classIdRef.current = selectedClassId;

      // Fetch signed PDF URL
      const urlRes = await fetch(`/api/courses/${courseId}/signed-url`);
      const urlData = await urlRes.json() as { url?: string; error?: string };
      if (!urlRes.ok) throw new Error(urlData.error ?? "Erreur URL PDF");

      // Fetch members if class selected
      if (selectedClassId) {
        const membersRes = await fetch(`/api/classes/${selectedClassId}/members`);
        const membersData = await membersRes.json() as Member[];
        if (Array.isArray(membersData)) {
          setMembers(membersData);
          const initAttendance: Record<string, AttendanceStatus> = {};
          membersData.forEach((m) => { initAttendance[m.student_user_id] = "present"; });
          setAttendance(initAttendance);
        }
      }

      setSession(newSession);
      setPdfUrl(urlData.url!);
      setStartedAt(new Date());
      setState("live");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
      setState("class-select");
    }
  }

  async function handlePageChange(newPage: number) {
    if (!session || newPage < 1) return;
    if (totalPages !== null && newPage > totalPages) return;

    setCurrentPage(newPage);
    currentPageRef.current = newPage;

    const res = await fetch(`/api/live-sessions/${session.id}/page`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: newPage }),
    });

    if (res.status === 410) {
      setSession(null);
      setState("ended");
    }
  }

  async function handleAttendanceChange(studentId: string, status: AttendanceStatus) {
    setAttendance((prev) => ({ ...prev, [studentId]: status }));

    if (!classIdRef.current) return;

    // Fire-and-forget upsert — single record
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
    setState("ended");
  }

  // ── Class-select phase ────────────────────────────────────────────────────

  if (state === "class-select" || state === "starting") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 py-12 text-white">
        <div className="w-full max-w-md">
          <button
            onClick={() => router.back()}
            className="mb-6 text-sm font-bold text-gray-500 transition hover:text-purple-400"
          >
            ← Retour
          </button>

          <h1 className="text-2xl font-black">Démarrer un cours live</h1>
          <p className="mt-1 text-sm text-gray-400">
            Choisissez une classe pour activer le suivi des présences, ou démarrez sans classe.
          </p>

          <div className="mt-6">
            <label className="text-xs font-black uppercase tracking-widest text-gray-500">
              Classe (optionnel)
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none"
              disabled={state === "starting"}
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
            disabled={state === "starting"}
            className="mt-6 w-full rounded-xl bg-purple-500 py-3 font-black text-gray-950 transition hover:bg-purple-400 disabled:opacity-50"
          >
            {state === "starting" ? "Démarrage…" : "Démarrer le cours live"}
          </button>
        </div>
      </main>
    );
  }

  // ── Ended phase ───────────────────────────────────────────────────────────

  if (state === "ended") {
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

  // ── Live phase ────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-white">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-gray-800 bg-gray-900 px-3">
        <div className="flex items-center gap-3 min-w-0">
          {session && (
            <PairingCodeDisplay
              code={session.code}
              size="compact"
              onRegenerate={handleRegenerate}
            />
          )}
          {startedAt && <LiveTimer startedAt={startedAt} />}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-xs text-gray-500 sm:block">
            Page {currentPage}{totalPages ? ` / ${totalPages}` : ""}
          </span>
          <button
            onClick={handleEnd}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300 hover:bg-red-500/20"
          >
            Terminer
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Attendance panel (20%) — only when class selected */}
        {members.length > 0 && (
          <aside className="flex w-1/5 min-w-[160px] flex-col overflow-y-auto border-r border-gray-800 bg-gray-900/50">
            <div className="px-2 py-3">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                Présences
              </p>
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

        {/* PDF viewer (80% or 100%) */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {pdfUrl ? (
            <iframe
              key={currentPage}
              className="h-full w-full border-0"
              src={`${pdfUrl}#page=${currentPage}`}
              title="PDF du cours"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-gray-500">
              Chargement du PDF…
            </div>
          )}

          {/* Page navigation */}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2 shadow-lg backdrop-blur-sm">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-white disabled:opacity-30"
              aria-label="Page précédente"
            >
              ‹
            </button>
            <span className="min-w-[5rem] text-center text-sm font-bold">
              {currentPage}{totalPages ? ` / ${totalPages}` : ""}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={totalPages !== null && currentPage >= totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-white disabled:opacity-30"
              aria-label="Page suivante"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
