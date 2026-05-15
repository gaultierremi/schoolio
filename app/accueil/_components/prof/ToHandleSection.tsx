"use client";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

type ToHandle = {
  pending_exercises: number;
  pending_questions: number;
  overdue_assignments: number;
};

export default function ToHandleSection({
  toHandle,
  loading,
  suggestions,
}: {
  toHandle?: ToHandle;
  loading: boolean;
  suggestions?: string[];
}) {
  if (loading) {
    return <div className="h-10 animate-pulse rounded-xl bg-[rgb(var(--surface-3))]" />;
  }

  const total =
    (toHandle?.pending_exercises ?? 0) +
    (toHandle?.pending_questions ?? 0) +
    (toHandle?.overdue_assignments ?? 0);

  if (total === 0) {
    return (
      <p className="flex items-center justify-center gap-2 py-1 text-center text-sm text-[rgb(var(--ink-3))]">
        <CheckCircle2 className="h-4 w-4 text-[rgb(var(--green))]" aria-hidden />
        Tout est à jour ! Rien ne t&apos;attend pour le moment.
      </p>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
        À traiter
      </h2>
      <div className="flex flex-wrap gap-3">
        {(toHandle?.pending_exercises ?? 0) > 0 && (
          <Link
            href="/accueil/cours"
            className="flex items-center gap-2 rounded-xl border border-[rgb(var(--warm))]/30 bg-[rgb(var(--warm))]/10 px-4 py-2 text-sm font-black text-[rgb(var(--warm))] transition hover:bg-[rgb(var(--warm))]/20"
          >
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[rgb(var(--warm))] px-1.5 text-[10px] font-black text-white">
              {toHandle!.pending_exercises}
            </span>
            Exercices à valider
          </Link>
        )}
        {(toHandle?.pending_questions ?? 0) > 0 && (
          <Link
            href="/accueil/curation"
            className="flex items-center gap-2 rounded-xl border border-[rgb(var(--warm))]/30 bg-[rgb(var(--warm))]/10 px-4 py-2 text-sm font-black text-[rgb(var(--warm))] transition hover:bg-[rgb(var(--warm))]/20"
          >
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[rgb(var(--warm))] px-1.5 text-[10px] font-black text-white">
              {toHandle!.pending_questions}
            </span>
            Questions à valider
          </Link>
        )}
        {(toHandle?.overdue_assignments ?? 0) > 0 && (
          <Link
            href="/school/classes"
            className="flex items-center gap-2 rounded-xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/10 px-4 py-2 text-sm font-black text-[rgb(var(--red))] transition hover:bg-[rgb(var(--red))]/20"
          >
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[rgb(var(--red))] px-1.5 text-[10px] font-black text-white">
              {toHandle!.overdue_assignments}
            </span>
            Devoirs en retard
          </Link>
        )}
      </div>
      {suggestions && suggestions.length > 0 && (
        <div className="mt-3 space-y-1">
          {suggestions.map((s, i) => (
            <p key={i} className="text-xs italic text-[rgb(var(--ink-3))]">{s}</p>
          ))}
        </div>
      )}
    </section>
  );
}
