"use client";

import { Clock } from "lucide-react";
import type { DailyEffort } from "@/lib/types/student-dashboard";

type Props = {
  minutes: number;
  questions: number;
  correctRate: number | null;
  daily: DailyEffort[];
};

const DAY_LABEL = ["D", "L", "M", "M", "J", "V", "S"];

export default function WeeklyEffort({ minutes, questions, correctRate, daily }: Props) {
  // Pour la bar height : on normalise sur le max de la semaine
  const max = Math.max(1, ...daily.map((d) => d.questions_answered));

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <Clock className="h-4 w-4 text-[rgb(var(--ink-3))]" aria-hidden />
        <p className="text-xs uppercase tracking-wide text-[rgb(var(--ink-3))]">
          Effort cette semaine
        </p>
      </div>
      <p className="serif text-lg font-semibold text-[rgb(var(--ink))]">
        {minutes} minute{minutes > 1 ? "s" : ""}
      </p>
      <p className="mt-2 text-sm text-[rgb(var(--ink-2))]">
        {questions} question{questions > 1 ? "s" : ""} répondue{questions > 1 ? "s" : ""}
        {correctRate !== null && ` · ${correctRate}% correctes`}
      </p>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {daily.map((d) => {
          const ratio = d.questions_answered / max;
          const intensity = d.questions_answered === 0
            ? "bg-[rgb(var(--surface-3))]"
            : "bg-[rgb(var(--accent))]";
          const opacity = d.questions_answered === 0 ? 1 : Math.max(0.25, ratio);
          const isToday = d.date === todayIso;
          const dow = new Date(d.date + "T12:00:00").getDay();
          return (
            <div
              key={d.date}
              className={`relative h-8 rounded ${intensity} ${isToday ? "ring-2 ring-[rgb(var(--accent))] ring-offset-1 ring-offset-[rgb(var(--surface))]" : ""}`}
              style={{ opacity }}
              title={`${d.date} : ${d.questions_answered} question${d.questions_answered > 1 ? "s" : ""}`}
              aria-label={`${DAY_LABEL[dow]} ${d.date} : ${d.questions_answered} questions`}
            />
          );
        })}
      </div>
    </div>
  );
}
