"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  FileText,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";

/**
 * Page detail devoir cote eleve.
 *
 * Migration design Maia (audit hard review 2026-05-25 P1) :
 * - Schoolio gray-950 / purple-500 -> Maia slate-50 / indigo-600
 * - font-black -> font-semibold
 * - rounded-2xl full-width CTAs -> compact rounded-lg
 * - Emojis -> Lucide icons
 */

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
  pending:
    "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400",
  in_progress:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  completed:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-BE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
      setAssignment((prev) =>
        prev ? { ...prev, status: "completed", completed_at: new Date().toISOString() } : prev,
      );
    }
    setMarkingRead(false);
  }

  async function handleOpenPdf() {
    setPdfLoading(true);
    const res = await fetch(`/api/student/assignments/${id}/pdf-url`);
    const json = (await res.json()) as { url?: string };
    if (json.url) {
      setPdfUrl(json.url);
      window.open(json.url, "_blank", "noopener,noreferrer");
    }
    setPdfLoading(false);
  }

  function handleStartQuiz() {
    router.push(`/accueil/devoirs/${id}/quiz`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2
          size={24}
          strokeWidth={2}
          aria-hidden="true"
          className="animate-spin text-indigo-600 motion-reduce:animate-none"
        />
      </main>
    );
  }

  if (!assignment) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center dark:bg-slate-950">
        <Search
          size={40}
          strokeWidth={1.5}
          aria-hidden="true"
          className="text-slate-400 dark:text-slate-500"
        />
        <p className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Devoir introuvable
        </p>
        <Link
          href="/accueil"
          className="
            mt-4 inline-flex items-center gap-1.5 text-sm text-indigo-700 transition
            hover:text-indigo-800
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
            dark:text-indigo-400 dark:hover:text-indigo-300
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
          Retour au dashboard
        </Link>
      </main>
    );
  }

  const overdue =
    assignment.due_date &&
    assignment.status !== "completed" &&
    new Date(assignment.due_date) < new Date();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950" lang="fr-BE">
      <div className="mx-auto w-full max-w-xl">
        <Link
          href="/accueil"
          className="
            inline-flex items-center gap-1.5 rounded-md text-xs text-slate-600 transition
            hover:text-slate-900
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
            dark:text-slate-400 dark:hover:text-slate-200
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          <ArrowLeft size={12} strokeWidth={2} aria-hidden="true" />
          Mon espace
        </Link>

        {/* Header */}
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {assignment.title}
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:text-slate-400">
              {assignment.resource_type === "pdf" ? (
                <>
                  <FileText size={10} strokeWidth={2} aria-hidden="true" />
                  Lecture
                </>
              ) : (
                <>
                  <Sparkles size={10} strokeWidth={2} aria-hidden="true" />
                  Quiz
                </>
              )}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {assignment.class_name} · {assignment.course_title}
          </p>
          {assignment.due_date && (
            <p
              className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
                overdue
                  ? "text-red-700 dark:text-red-300"
                  : "text-amber-700 dark:text-amber-300"
              }`}
            >
              {overdue ? (
                <AlertCircle size={12} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Calendar size={12} strokeWidth={2} aria-hidden="true" />
              )}
              {overdue ? "En retard · " : "Avant le "}
              {fmtDate(assignment.due_date)}
            </p>
          )}
        </div>

        {/* Status + score */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[assignment.status] ?? ""}`}
          >
            {STATUS_LABEL[assignment.status] ?? assignment.status}
          </span>
          {assignment.status === "completed" && assignment.score !== null && (
            <span className="text-lg font-semibold text-indigo-700 dark:text-indigo-400">
              {Math.round(Number(assignment.score))}%
            </span>
          )}
          {assignment.attempts_count > 0 && assignment.resource_type === "quiz" && (
            <span className="text-xs text-slate-500 dark:text-slate-500">
              {assignment.attempts_count} tentative
              {assignment.attempts_count > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Description */}
        {assignment.description && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {assignment.description}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 space-y-3">
          {assignment.resource_type === "pdf" && (
            <>
              <button
                onClick={handleOpenPdf}
                disabled={pdfLoading}
                className="
                  inline-flex w-full items-center justify-center gap-2 rounded-lg
                  border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium
                  text-slate-700 transition
                  hover:bg-slate-50
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                  focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
                  dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800
                  dark:focus-visible:ring-offset-slate-950
                  disabled:cursor-not-allowed disabled:opacity-50
                  motion-reduce:transition-none
                "
              >
                {pdfLoading ? (
                  <>
                    <Loader2
                      size={14}
                      strokeWidth={2}
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                    Chargement…
                  </>
                ) : (
                  <>
                    <FileText size={14} strokeWidth={2} aria-hidden="true" />
                    Voir le cours
                  </>
                )}
              </button>
              {pdfUrl && assignment.status !== "completed" && (
                <button
                  onClick={handleMarkRead}
                  disabled={markingRead}
                  className="
                    inline-flex w-full items-center justify-center gap-2 rounded-lg
                    bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition
                    hover:bg-emerald-700
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500
                    focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
                    dark:focus-visible:ring-offset-slate-950
                    disabled:cursor-not-allowed disabled:opacity-50
                    motion-reduce:transition-none
                  "
                >
                  {markingRead ? (
                    "…"
                  ) : (
                    <>
                      <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" />
                      J&apos;ai lu
                    </>
                  )}
                </button>
              )}
              {assignment.status === "completed" && (
                <div className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" />
                  Lu · {fmtDate(assignment.completed_at)}
                </div>
              )}
            </>
          )}

          {assignment.resource_type === "quiz" && (
            <>
              {assignment.status === "completed" && (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
                  <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                    {Math.round(Number(assignment.score ?? 0))}%
                  </p>
                  <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    Quiz complété
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">
                    Le score affiché est ton meilleur score.
                  </p>
                </div>
              )}
              <button
                onClick={handleStartQuiz}
                className="
                  inline-flex w-full items-center justify-center gap-2 rounded-lg
                  bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition
                  hover:bg-indigo-700
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                  focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
                  dark:focus-visible:ring-offset-slate-950
                  motion-reduce:transition-none
                "
              >
                {assignment.status === "pending" ? (
                  <>
                    <Play size={14} strokeWidth={2} aria-hidden="true" />
                    Commencer le quiz
                  </>
                ) : assignment.status === "in_progress" ? (
                  <>
                    <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
                    Recommencer le quiz
                  </>
                ) : (
                  <>
                    <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
                    Refaire pour s&apos;améliorer
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
