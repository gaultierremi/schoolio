"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, School, FileText, Brain } from "lucide-react";
import { SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId } from "@/lib/subjects";
type AssignmentEntry = {
  id: string;
  title: string;
  resource_type: string;
  resource_id: string;
  due_date: string | null;
  class_id: string;
  class_name: string;
  status: string;
  score: number | null;
};
import StudentWelcomeOnboarding from "@/components/StudentWelcomeOnboarding";

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
  displayName: string;
  showOnboarding: boolean;
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
  pending: "border-[rgb(var(--border))] text-[rgb(var(--ink-3))]",
  in_progress: "border-[rgb(var(--warm))]/40 text-[rgb(var(--warm))] bg-[rgb(var(--warm))]/5",
  completed: "border-[rgb(var(--green))]/40 text-[rgb(var(--green))] bg-[rgb(var(--green))]/5",
};

function AssignmentCard({ a }: { a: AssignmentEntry }) {
  const router = useRouter();
  const overdue = a.due_date && a.status !== "completed" && new Date(a.due_date) < new Date();

  return (
    <div
      onClick={() => router.push(`/student/assignments/${a.id}`)}
      className="flex cursor-pointer flex-col gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition hover:border-[rgb(var(--accent))]/40 hover:bg-[rgb(var(--surface-3))]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[rgb(var(--ink-3))]">
              {a.resource_type === "pdf"
                ? <FileText className="h-3.5 w-3.5" aria-hidden />
                : <Brain className="h-3.5 w-3.5" aria-hidden />}
            </span>
            <p className="truncate font-bold text-[rgb(var(--ink))]">{a.title}</p>
          </div>
          <p className="mt-0.5 truncate text-xs text-[rgb(var(--ink-3))]">{a.class_name}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[a.status] ?? ""}`}>
          {STATUS_LABEL[a.status] ?? a.status}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-[rgb(var(--ink-3))]">
        {a.due_date && (
          <span className={overdue ? "font-bold text-[rgb(var(--red))]" : "text-[rgb(var(--ink-2))]"}>
            <Calendar className="mr-1 inline h-3 w-3" aria-hidden />
            {overdue ? "En retard · " : ""}{formatDate(a.due_date)}
          </span>
        )}
        {a.status === "completed" && a.score !== null && (
          <span className="font-bold text-[rgb(var(--accent))]">{Math.round(Number(a.score))}%</span>
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
      <div className="flex flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div>
          <p className="font-black text-[rgb(var(--ink))]">{entry.className}</p>
          <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">
            Prof : {entry.teacherName}
            {subj && <> · {subj.label}</>}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-[rgb(var(--ink-3))]">Rejoint le {formatDate(entry.joinedAt)}</p>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={leaving}
            className="rounded-lg border border-[rgb(var(--border))] px-2 py-1 text-xs text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--red))]/60 hover:text-[rgb(var(--red))] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Quitter
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-xl">
            <h2 className="serif text-lg font-black text-[rgb(var(--ink))]">Quitter cette classe ?</h2>
            <p className="mt-2 text-sm text-[rgb(var(--ink-2))]">
              Tu seras retiré de <span className="font-bold text-[rgb(var(--ink))]">{entry.className}</span>.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-2xl border border-[rgb(var(--border))] py-2.5 text-sm font-bold text-[rgb(var(--ink-2))] transition hover:text-[rgb(var(--ink))]"
              >
                Annuler
              </button>
              <button
                onClick={() => { setConfirmOpen(false); onLeave(entry.classId); }}
                className="flex-1 rounded-2xl bg-[rgb(var(--red))] py-2.5 text-sm font-bold text-white transition hover:opacity-90"
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

export default function StudentDashboardClient({ classes: initialClasses, assignments, displayName, showOnboarding }: Props) {
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

      {showOnboarding && <StudentWelcomeOnboarding displayName={displayName} />}

      {/* Assignments */}
      {assignments.length > 0 && (
        <div>
          <h2 className="serif text-xl font-black text-[rgb(var(--ink))]">
            <Calendar className="mr-2 inline h-5 w-5 text-[rgb(var(--accent))]" aria-hidden />
            Mes devoirs
          </h2>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setAssignTab("todo")}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                assignTab === "todo"
                  ? "bg-[rgb(var(--accent))] text-white"
                  : "border border-[rgb(var(--border))] text-[rgb(var(--ink-3))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))]"
              }`}
            >
              À faire ({todoAssignments.length})
            </button>
            <button
              onClick={() => setAssignTab("done")}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                assignTab === "done"
                  ? "bg-[rgb(var(--accent))] text-white"
                  : "border border-[rgb(var(--border))] text-[rgb(var(--ink-3))] hover:border-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))]"
              }`}
            >
              Fait ({doneAssignments.length})
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {visibleAssignments.length === 0 ? (
              <p className="col-span-2 py-6 text-center text-sm text-[rgb(var(--ink-3))]">
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
        <h2 className="serif text-xl font-black text-[rgb(var(--ink))]">
          <School className="mr-2 inline h-5 w-5 text-[rgb(var(--accent))]" aria-hidden />
          Mes classes
        </h2>
        <div className="mt-3">
          {classes.length === 0 ? (
            <div className="mt-4 text-center">
              <School className="mx-auto h-12 w-12 text-[rgb(var(--ink-3))]" aria-hidden />
              <p className="mt-4 text-lg font-black text-[rgb(var(--ink))]">Tu n&apos;es inscrit dans aucune classe</p>
              <a
                href="/join"
                className="mt-4 inline-block rounded-2xl bg-[rgb(var(--accent))] px-6 py-2.5 font-black text-white transition hover:opacity-90"
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
