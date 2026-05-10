"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import type { UpcomingAssignment, RecentCompletion } from "@/lib/types/student-dashboard";
import { GRADE_LABEL, GRADE_STYLE, computeLetterGrade } from "@/lib/grading";

type Props = {
  upcoming: UpcomingAssignment[];
  recent: RecentCompletion[];
};

function dueDateLabel(deadline: string | null, status: string): string {
  if (!deadline) return "";
  const d = new Date(deadline);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (status === "overdue") return "En retard";
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Demain";
  if (diffDays <= 7) return `Dans ${diffDays}j`;
  return d.toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
}

function statusChip(status: UpcomingAssignment["status"]) {
  if (status === "overdue")
    return (
      <span className="rounded-full bg-red-900/60 px-2 py-0.5 text-xs font-semibold text-red-300">
        En retard
      </span>
    );
  if (status === "in_progress")
    return (
      <span className="rounded-full bg-blue-900/60 px-2 py-0.5 text-xs font-semibold text-blue-300">
        En cours
      </span>
    );
  return null;
}

export default function AssignmentList({ upcoming, recent }: Props) {
  return (
    <div className="space-y-6">
      {/* À FAIRE */}
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-purple-400">
          À faire maintenant
        </h2>

        {upcoming.length === 0 ? (
          <EmptyState
            variant="compact"
            icon="🎉"
            title="Tout est à jour !"
            description="Aucun devoir en attente pour le moment."
          />
        ) : (
          <ul className="space-y-2">
            {upcoming.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/student/assignments/${a.id}`}
                  className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    a.status === "overdue"
                      ? "border-red-800/50 bg-red-950/30 hover:bg-red-950/50"
                      : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-white">{a.title}</span>
                      {statusChip(a.status)}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {a.class_name}
                      {a.course_title ? ` · ${a.course_title}` : ""}
                    </p>
                  </div>
                  {a.deadline && (
                    <span
                      className={`shrink-0 text-xs font-medium ${
                        a.status === "overdue" ? "text-red-400" : "text-zinc-400"
                      }`}
                    >
                      {dueDateLabel(a.deadline, a.status)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* RÉCENTS */}
      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            Récents
          </h2>
          <ul className="space-y-1.5">
            {recent.map((a) => {
              const grade = computeLetterGrade({ status: "completed", score: a.score });
              return (
                <li
                  key={a.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${GRADE_STYLE[grade]}`}
                >
                  <span className="truncate text-zinc-300">{a.title}</span>
                  <span className="shrink-0 text-xs">{GRADE_LABEL[grade]}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
