"use client";

import Link from "next/link";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  FileText,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import type { AssignmentItem } from "@/lib/types/student-dashboard";
import { subjectColor } from "./SubjectClassPicker";

type Props = { assignment: AssignmentItem };

function dueLabel(deadline: string | null, isOverdue: boolean): { text: string; tone: "neutral" | "warn" | "danger" } {
  if (!deadline) return { text: "Sans échéance", tone: "neutral" };
  const d = new Date(deadline);
  if (isOverdue) return { text: `En retard depuis le ${fmtShort(d)}`, tone: "danger" };
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (diffDays === 0) return { text: "Aujourd'hui", tone: "warn" };
  if (diffDays === 1) return { text: "Demain", tone: "warn" };
  if (diffDays <= 3) return { text: `Dans ${diffDays} jours`, tone: "warn" };
  if (diffDays <= 7) return { text: `Dans ${diffDays} jours`, tone: "neutral" };
  return { text: `Échéance ${fmtShort(d)}`, tone: "neutral" };
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-[rgb(var(--ink-3))]";
  if (score >= 70) return "text-[rgb(34_197_94)]";
  if (score >= 50) return "text-[rgb(250_204_21)]";
  return "text-[rgb(239_68_68)]";
}

export default function AssignmentCard({ assignment: a }: Props) {
  const color = subjectColor(a.subject);
  const isOverdue = a.status === "overdue";
  const isCompleted = a.status === "completed";
  const due = dueLabel(a.due_date, isOverdue);

  const cardBorder = isOverdue
    ? "border-[rgb(239_68_68)]/40 bg-[rgb(239_68_68)]/5"
    : isCompleted
    ? "border-[rgb(var(--border))]"
    : "border-[rgb(var(--border))]";

  return (
    <Link
      href={`/student/assignments/${a.id}`}
      className={`block rounded-2xl border ${cardBorder} bg-[rgb(var(--surface))] p-5 transition-shadow hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            {a.subject && (
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${color.bg} ${color.text}`}>
                {a.subject.charAt(0).toUpperCase() + a.subject.slice(1)}
              </span>
            )}
            <span className="text-[10px] text-[rgb(var(--ink-3))]">{a.class_name}</span>
            {a.resource_type === "quiz" ? (
              <span className="rounded-md bg-[rgb(var(--accent))]/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--accent))]">
                Quiz
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-md bg-[rgb(var(--surface-3))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--ink-2))]">
                <FileText className="h-2.5 w-2.5" aria-hidden />
                Cours
              </span>
            )}
          </div>
          <h3 className="serif mt-1 text-base font-semibold text-[rgb(var(--ink))] line-clamp-2">
            {a.title}
          </h3>
          {a.course_title && (
            <p className="mt-1 text-xs text-[rgb(var(--ink-3))] line-clamp-1">{a.course_title}</p>
          )}
        </div>

        <div className="shrink-0 text-right">
          {isCompleted ? (
            <>
              <p className={`text-lg font-semibold ${scoreColor(a.score)}`}>
                {a.score !== null ? `${Math.round(Number(a.score))}%` : "Fait"}
              </p>
              <p className="mt-0.5 text-[10px] text-[rgb(var(--ink-3))]">Score</p>
            </>
          ) : isOverdue ? (
            <p className="flex items-center gap-1 text-xs font-medium text-[rgb(239_68_68)]">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              En retard
            </p>
          ) : a.status === "in_progress" ? (
            <p className="flex items-center gap-1 text-xs font-medium text-[rgb(245_158_11)]">
              <PlayCircle className="h-3 w-3" aria-hidden />
              En cours
            </p>
          ) : (
            <p className="text-xs font-medium text-[rgb(var(--ink-2))]">À faire</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p
          className={`flex items-center gap-1.5 text-xs font-medium ${
            due.tone === "danger"
              ? "text-[rgb(239_68_68)]"
              : due.tone === "warn"
              ? "text-[rgb(245_158_11)]"
              : "text-[rgb(var(--ink-3))]"
          }`}
        >
          <Clock className="h-3 w-3" aria-hidden />
          {due.text}
        </p>

        <span
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
            isCompleted
              ? "border border-[rgb(var(--border))] text-[rgb(var(--ink-2))]"
              : "bg-[rgb(var(--accent))] text-white"
          }`}
        >
          {isCompleted ? (
            <>
              <RotateCcw className="h-3 w-3" aria-hidden />
              Refaire
            </>
          ) : a.status === "in_progress" ? (
            <>
              Reprendre
              <ArrowRight className="h-3 w-3" aria-hidden />
            </>
          ) : (
            <>
              {a.resource_type === "quiz" ? "Lancer le quiz" : "Ouvrir"}
              <ArrowRight className="h-3 w-3" aria-hidden />
            </>
          )}
        </span>
      </div>
    </Link>
  );
}

export { CheckCircle2 };
