"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type AssignmentData = {
  id: string;
  title: string;
  description: string | null;
  resource_type: "pdf" | "quiz";
  course_title: string;
  class_name: string;
  due_date: string | null;
  status: string;
  score: number | null;
  attempts_count: number;
  completed_at: string | null;
  last_attempt_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "À faire",
  in_progress: "En cours",
  completed: "Fait",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "border-gray-700 text-gray-500",
  in_progress: "border-amber-600/40 text-amber-400",
  completed: "border-green-600/40 text-green-400",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" });
}

export default function StudentAssignmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [assignment, setAssignment] = useState<AssignmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingRead, setMarkingRead] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/student/assignments`)
      .then((r) => r.json())
      .then((j: { assignments?: AssignmentData[] }) => {
        const found = (j.assignments ?? []).find((a) => a.id === id);
        setAssignment(found ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleMarkRead() {
    setMarkingRead(true);
    const res = await fetch(`/api/student/assignments/${id}/mark-read`, { method: "POST" });
    if (res.ok) {
      setAssignment((prev) => prev ? { ...prev, status: "completed", completed_at: new Date().toISOString() } : prev);
    }
    setMarkingRead(false);
  }

  async function handleOpenPdf() {
    setPdfLoading(true);
    const res = await fetch(`/api/student/assignments/${id}/pdf-url`);
    const json = await res.json() as { url?: string };
    if (json.url) {
      setPdfUrl(json.url);
      window.open(json.url, "_blank");
    }
    setPdfLoading(false);
  }

  function handleStartQuiz() {
    router.push(`/student/assignments/${id}/quiz`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-purple-500" />
      </main>
    );
  }

  if (!assignment) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 text-center">
        <p className="text-4xl">🔍</p>
        <p className="mt-4 text-lg font-black text-white">Devoir introuvable</p>
        <a href="/student" className="mt-4 text-sm text-purple-400 hover:text-purple-300">← Retour au dashboard</a>
      </main>
    );
  }

  const overdue = assignment.due_date && assignment.status !== "completed" && new Date(assignment.due_date) < new Date();

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-xl">

        <a href="/student" className="text-xs text-gray-500 hover:text-gray-400">← Mon espace</a>

        {/* Header */}
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">{assignment.resource_type === "pdf" ? "📄" : "🧠"}</span>
            <h1 className="text-2xl font-black text-white">{assignment.title}</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {assignment.class_name} · {assignment.course_title}
          </p>
          {assignment.due_date && (
            <p className={`mt-1 text-xs font-bold ${overdue ? "text-red-400" : "text-amber-400"}`}>
              📅 {overdue ? "En retard · " : "Avant le "}{fmtDate(assignment.due_date)}
            </p>
          )}
        </div>

        {/* Status + score */}
        <div className="mt-4 flex items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLE[assignment.status] ?? ""}`}>
            {STATUS_LABEL[assignment.status] ?? assignment.status}
          </span>
          {assignment.status === "completed" && assignment.score !== null && (
            <span className="text-lg font-black text-purple-400">{Math.round(Number(assignment.score))}%</span>
          )}
          {assignment.attempts_count > 0 && assignment.resource_type === "quiz" && (
            <span className="text-xs text-gray-600">{assignment.attempts_count} tentative{assignment.attempts_count > 1 ? "s" : ""}</span>
          )}
        </div>

        {/* Description */}
        {assignment.description && (
          <div className="mt-5 rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-sm text-gray-300 leading-relaxed">{assignment.description}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 space-y-3">
          {assignment.resource_type === "pdf" && (
            <>
              <button
                onClick={handleOpenPdf}
                disabled={pdfLoading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-700 py-3 font-bold text-gray-300 transition hover:border-gray-500 hover:text-white disabled:opacity-50"
              >
                {pdfLoading ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-white" /> Chargement…</>
                ) : (
                  <><span>📄</span> Voir le cours</>
                )}
              </button>
              {pdfUrl && assignment.status !== "completed" && (
                <button
                  onClick={handleMarkRead}
                  disabled={markingRead}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-3 font-black text-white transition hover:bg-green-500 disabled:opacity-50"
                >
                  {markingRead ? "…" : "✓ J'ai lu"}
                </button>
              )}
              {assignment.status === "completed" && (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-green-600/40 bg-green-500/10 py-3 text-sm font-bold text-green-400">
                  ✓ Lu · {fmtDate(assignment.completed_at)}
                </div>
              )}
            </>
          )}

          {assignment.resource_type === "quiz" && (
            <>
              {assignment.status === "completed" && (
                <div className="rounded-2xl border border-green-600/40 bg-green-500/10 p-4 text-center">
                  <p className="text-3xl font-black text-white">{Math.round(Number(assignment.score ?? 0))}%</p>
                  <p className="mt-1 text-sm text-green-400 font-bold">Quiz complété</p>
                  <p className="mt-0.5 text-xs text-gray-500">Le score affiché est ton meilleur score.</p>
                </div>
              )}
              <button
                onClick={handleStartQuiz}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-500 py-3.5 font-black text-gray-950 transition hover:bg-purple-400"
              >
                {assignment.status === "pending" ? "▶ Commencer le quiz" :
                 assignment.status === "in_progress" ? "↩ Recommencer le quiz" :
                 "↺ Refaire pour s'améliorer"}
              </button>
            </>
          )}
        </div>

      </div>
    </main>
  );
}
