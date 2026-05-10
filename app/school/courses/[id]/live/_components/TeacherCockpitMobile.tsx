"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AttendanceRow, type AttendanceStatus } from "@/components/ui/AttendanceRow";
import { PdfPageNavigator } from "@/components/ui/PdfPageNavigator";
import { ZoomControls } from "@/components/ui/ZoomControls";
import { LiveSessionTimer } from "@/components/ui/LiveSessionTimer";
import { PairingCodeDisplay } from "@/components/ui/PairingCodeDisplay";
import { RandomPickAnimation, type Student } from "@/components/ui/RandomPickAnimation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import MiniPdfPreview from "./MiniPdfPreview";

type Member = { student_user_id: string; display_name: string };

type PickResult = {
  pick_id: string;
  student_user_id: string;
  student_name: string;
  all_candidates: Array<{ student_user_id: string; student_name: string }>;
};

export type TeacherCockpitMobileProps = {
  session: { id: string; code: string } | null;
  pdfUrl: string | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  members: Member[];
  attendance: Record<string, AttendanceStatus>;
  classId: string;
  sessionId: string;
  startedAt: Date;
  endsAt: Date;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onAttendanceChange: (studentId: string, status: AttendanceStatus) => void;
  onEnd: () => void;
  onRegenerate: () => void;
};

const PICK_STATS_INTERVAL_MS = 2 * 60 * 1000;

export function TeacherCockpitMobile({
  session,
  pdfUrl,
  currentPage,
  totalPages,
  zoom,
  members,
  attendance,
  classId,
  sessionId,
  startedAt,
  endsAt,
  onPageChange,
  onZoomChange,
  onAttendanceChange,
  onEnd,
  onRegenerate,
}: TeacherCockpitMobileProps) {
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isPickLoading, setIsPickLoading] = useState(false);
  const [showPickAnimation, setShowPickAnimation] = useState(false);
  const [pickResult, setPickResult] = useState<PickResult | null>(null);
  const [pickCounts, setPickCounts] = useState<Record<string, number>>({});
  const pickRefetchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPickStats = useCallback(async () => {
    if (!classId) return;
    try {
      const res = await fetch(`/api/classes/${classId}/pick-stats`);
      if (!res.ok) return;
      const data = await res.json() as Array<{ student_user_id: string; pick_count_30d: number }>;
      const counts: Record<string, number> = {};
      data.forEach((s) => { counts[s.student_user_id] = s.pick_count_30d; });
      setPickCounts(counts);
    } catch {
      // Non-blocking
    }
  }, [classId]);

  useEffect(() => {
    if (!classId) return;
    fetchPickStats();
    pickRefetchRef.current = setInterval(fetchPickStats, PICK_STATS_INTERVAL_MS);
    return () => { if (pickRefetchRef.current) clearInterval(pickRefetchRef.current); };
  }, [classId, fetchPickStats]);

  async function handleRandomPick() {
    if (!classId || isPickLoading) return;
    setIsPickLoading(true);
    try {
      const res = await fetch(`/api/classes/${classId}/random-pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ live_session_id: sessionId || undefined }),
      });
      if (!res.ok) return;
      const data = await res.json() as PickResult;
      setPickResult(data);
      setShowPickAnimation(true);
    } catch {
      // noop
    } finally {
      setIsPickLoading(false);
    }
  }

  function handlePickConfirm() {
    if (pickResult) {
      setPickCounts((prev) => ({
        ...prev,
        [pickResult.student_user_id]: (prev[pickResult.student_user_id] ?? 0) + 1,
      }));
    }
    setShowPickAnimation(false);
    setPickResult(null);
  }

  async function handlePickCancel() {
    if (pickResult) {
      await fetch(`/api/classes/${classId}/random-pick/${pickResult.pick_id}/cancel`, {
        method: "POST",
      }).catch(() => undefined);
    }
    setShowPickAnimation(false);
    setPickResult(null);
  }

  const pickCandidates: Student[] = pickResult?.all_candidates.map((c) => ({
    id: c.student_user_id,
    name: c.student_name,
  })) ?? [];

  const pickedStudent: Student | undefined = pickResult
    ? { id: pickResult.student_user_id, name: pickResult.student_name }
    : undefined;

  const hasClass = Boolean(classId && members.length > 0);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-white lg:hidden">
      {/* ── Header sticky ───────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-800 bg-gray-900 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {session && (
            <PairingCodeDisplay code={session.code} size="compact" onRegenerate={onRegenerate} />
          )}
          <LiveSessionTimer endsAt={endsAt} startedAt={startedAt} size="compact" />
        </div>
        <button
          onClick={() => setShowEndConfirm(true)}
          className="shrink-0 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-black text-red-300 hover:bg-red-500/20"
          type="button"
          aria-label="Terminer le cours"
        >
          ✕
        </button>
      </header>

      {/* ── Scrollable main ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#4b5563 transparent" }}>

        {/* Mini PDF preview + navigation */}
        <div className="border-b border-gray-800 px-3 py-3">
          <p className="mb-2 text-center text-xs font-black uppercase tracking-widest text-gray-500">
            {totalPages > 0 ? `Page ${currentPage} / ${totalPages}` : "Chargement…"}
          </p>
          <div className="flex justify-center">
            {pdfUrl && totalPages > 0 ? (
              <MiniPdfPreview pdfUrl={pdfUrl} pageNumber={currentPage} />
            ) : (
              <div className="h-44 w-full animate-pulse rounded-lg bg-gray-800" />
            )}
          </div>
          <div className="mt-3 flex flex-col items-center gap-2">
            <PdfPageNavigator
              currentPage={currentPage}
              totalPages={totalPages || 1}
              onPageChange={onPageChange}
              size="compact"
              disabled={totalPages === 0}
            />
            <ZoomControls
              zoom={zoom}
              onZoomChange={onZoomChange}
              size="compact"
              disabled={totalPages === 0}
              captureKeyboard
            />
          </div>
        </div>

        {/* Random pick CTA */}
        {hasClass && (
          <div className="border-b border-gray-800 px-3 py-4">
            <button
              onClick={handleRandomPick}
              disabled={isPickLoading}
              className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-purple-500 py-4 text-base font-black text-white shadow-lg shadow-purple-950/30 transition-opacity active:opacity-80 disabled:opacity-60"
              type="button"
              aria-label="Tirer un élève au hasard"
              aria-busy={isPickLoading}
            >
              {isPickLoading ? "Tirage…" : "🎲 Tirer un élève"}
            </button>
          </div>
        )}

        {/* Attendance list */}
        {members.length > 0 && (
          <div className="px-3 pb-4 pt-3">
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-500">
              Présences ({members.length})
            </p>
            <div className="space-y-0.5">
              {members.map((m) => {
                const count = pickCounts[m.student_user_id] ?? 0;
                return (
                  <div key={m.student_user_id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <AttendanceRow
                        studentId={m.student_user_id}
                        studentName={m.display_name}
                        status={attendance[m.student_user_id] ?? "present"}
                        onChange={(s) => onAttendanceChange(m.student_user_id, s)}
                        size="compact"
                      />
                    </div>
                    <span
                      className={`shrink-0 min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums ${
                        count > 0
                          ? "bg-purple-900/40 text-purple-400"
                          : "bg-gray-800 text-gray-500"
                      }`}
                      aria-label={`${count} tirage${count !== 1 ? "s" : ""} sur 30 jours`}
                    >
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* ── Footer sticky ───────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-gray-800 bg-gray-900/80 px-3 py-3">
        <button
          onClick={() => setShowEndConfirm(true)}
          className="w-full rounded-xl border border-red-500/40 bg-red-500/10 py-3 text-sm font-black text-red-300 hover:bg-red-500/20"
          type="button"
        >
          Terminer le cours
        </button>
      </footer>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={showEndConfirm}
        title="Terminer le cours live ?"
        description="L'écran de classe affichera « Cours terminé » et la session sera fermée."
        confirmLabel="Terminer"
        variant="destructive"
        onConfirm={onEnd}
        onCancel={() => setShowEndConfirm(false)}
      />

      {showPickAnimation && pickedStudent && pickCandidates.length > 0 && (
        <RandomPickAnimation
          candidates={pickCandidates}
          selectedStudent={pickedStudent}
          isVisible={showPickAnimation}
          onClose={handlePickConfirm}
          onCancel={handlePickCancel}
        />
      )}
    </div>
  );
}

export default TeacherCockpitMobile;
