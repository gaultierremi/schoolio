"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId } from "@/lib/subjects";
import type { AssignmentEntry } from "./page";

type ClassEntry = {
  classId: string;
  className: string;
  level: string | null;
  subject: string | null;
  teacherName: string;
  joinedAt: string;
};

type Props = {
  classes: ClassEntry[];
  assignments: AssignmentEntry[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-BE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function subjectMeta(subject: string | null) {
  if (!subject) return null;
  return SUBJECTS_BY_ID[subject as SubjectId] ?? null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "À faire",
  in_progress: "En cours",
  completed: "Fait",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "border-gray-700 text-gray-500",
  in_progress: "border-amber-600/40 text-amber-400 bg-amber-500/5",
  completed: "border-green-600/40 text-green-400 bg-green-500/5",
};

function AssignmentCard({ a }: { a: AssignmentEntry }) {
  const router = useRouter();
  const overdue = a.due_date && a.status !== "completed" && new Date(a.due_date) < new Date();

  return (
    <div
      onClick={() => router.push(`/student/assignments/${a.id}`)}
      className="flex cursor-pointer flex-col gap-2 rounded-2xl border border-gray-800 bg-gray-900 p-4 transition hover:border-purple-500/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-gray-600">
              {a.resource_type === "pdf" ? "📄" : "🧠"}
            </span>
            <p className="truncate font-bold text-white">{a.title}</p>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">{a.class_name}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[a.status] ?? ""}`}>
          {STATUS_LABEL[a.status] ?? a.status}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-600">
        {a.due_date && (
          <span className={overdue ? "text-red-400 font-bold" : "text-gray-500"}>
            📅 {overdue ? "En retard · " : ""}{formatDate(a.due_date)}
          </span>
        )}
        {a.status === "completed" && a.score !== null && (
          <span className="text-purple-400 font-bold">{Math.round(Number(a.score))}%</span>
        )}
      </div>
    </div>
  );
}

function ClassCard({
  entry,
  onLeave,
  leaving,
}: {
  entry: ClassEntry;
  onLeave: (classId: string) => void;
  leaving: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const subj = subjectMeta(entry.subject);

  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <div>
          <p className="font-black text-white">{entry.className}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Prof : {entry.teacherName}
            {subj && <> · {subj.emoji} {subj.label}</>}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-600">Rejoint le {formatDate(entry.joinedAt)}</p>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={leaving}
            className="rounded-lg border border-gray-700 px-2 py-1 text-xs text-gray-500 transition hover:border-red-700/60 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Quitter
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
            <h2 className="text-lg font-black text-white">Quitter cette classe ?</h2>
            <p className="mt-2 text-sm text-gray-400">
              Tu seras retiré de <span className="font-bold text-white">{entry.className}</span>.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-2xl border border-gray-700 py-2.5 text-sm font-bold text-gray-300 transition hover:text-white"
              >
                Annuler
              </button>
              <button
                onClick={() => { setConfirmOpen(false); onLeave(entry.classId); }}
                className="flex-1 rounded-2xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-500"
              >
                Quitter
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function StudentDashboardClient({ classes: initialClasses, assignments }: Props) {
  const [classes, setClasses] = useState(initialClasses);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [assignTab, setAssignTab] = useState<"todo" | "done">("todo");

  async function handleLeave(classId: string) {
    setLeavingId(classId);
    const res = await fetch(`/api/student/classes/${classId}/leave`, { method: "POST" });
    if (res.ok) setClasses((prev) => prev.filter((c) => c.classId !== classId));
    setLeavingId(null);
  }

  const todoAssignments = assignments.filter((a) => a.status !== "completed");
  const doneAssignments = assignments.filter((a) => a.status === "completed");
  const visibleAssignments = assignTab === "todo" ? todoAssignments : doneAssignments;

  return (
    <div className="flex flex-col gap-8">

      {/* Assignments */}
      {assignments.length > 0 && (
        <div>
          <h2 className="text-xl font-black text-white">📋 Mes devoirs</h2>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setAssignTab("todo")}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                assignTab === "todo"
                  ? "bg-purple-500 text-gray-950"
                  : "border border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              À faire ({todoAssignments.length})
            </button>
            <button
              onClick={() => setAssignTab("done")}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                assignTab === "done"
                  ? "bg-purple-500 text-gray-950"
                  : "border border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              Fait ({doneAssignments.length})
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {visibleAssignments.length === 0 ? (
              <p className="col-span-2 py-6 text-center text-sm text-gray-600">
                {assignTab === "todo" ? "Aucun devoir en attente. Bien joué !" : "Aucun devoir complété pour l'instant."}
              </p>
            ) : (
              visibleAssignments.map((a) => <AssignmentCard key={a.id} a={a} />)
            )}
          </div>
        </div>
      )}

      {/* Classes */}
      <div>
        <h2 className="text-xl font-black text-white">🏫 Mes classes</h2>
        <div className="mt-3">
          {classes.length === 0 ? (
            <div className="mt-4 text-center">
              <p className="text-4xl">🏫</p>
              <p className="mt-4 text-lg font-black text-white">Tu n&apos;es inscrit dans aucune classe</p>
              <a
                href="/join"
                className="mt-4 inline-block rounded-2xl bg-purple-500 px-6 py-2.5 font-black text-gray-950 transition hover:bg-purple-400"
              >
                Rejoindre une classe
              </a>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {classes.map((entry) => (
                <ClassCard
                  key={entry.classId}
                  entry={entry}
                  onLeave={handleLeave}
                  leaving={leavingId === entry.classId}
                />
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
