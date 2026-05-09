"use client";
import Link from "next/link";

type ToHandle = {
  pending_exercises: number;
  pending_questions: number;
  overdue_assignments: number;
};

export default function ToHandleSection({
  toHandle,
  loading,
}: {
  toHandle?: ToHandle;
  loading: boolean;
}) {
  if (loading) {
    return <div className="h-10 animate-pulse rounded-xl bg-gray-800" />;
  }

  const total =
    (toHandle?.pending_exercises ?? 0) +
    (toHandle?.pending_questions ?? 0) +
    (toHandle?.overdue_assignments ?? 0);

  if (total === 0) {
    return (
      <p className="py-1 text-center text-sm text-gray-400">
        🎉 Tout est à jour ! Rien ne t&apos;attend pour le moment.
      </p>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-gray-500">
        À traiter
      </h2>
      <div className="flex flex-wrap gap-3">
        {(toHandle?.pending_exercises ?? 0) > 0 && (
          <Link
            href="/school/courses"
            className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-black text-amber-300 transition hover:bg-amber-500/20"
          >
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-gray-950">
              {toHandle!.pending_exercises}
            </span>
            Exercices à valider
          </Link>
        )}
        {(toHandle?.pending_questions ?? 0) > 0 && (
          <Link
            href="/school/questions"
            className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-black text-amber-300 transition hover:bg-amber-500/20"
          >
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-gray-950">
              {toHandle!.pending_questions}
            </span>
            Questions à valider
          </Link>
        )}
        {(toHandle?.overdue_assignments ?? 0) > 0 && (
          <Link
            href="/school/classes"
            className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-black text-red-300 transition hover:bg-red-500/20"
          >
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white">
              {toHandle!.overdue_assignments}
            </span>
            Devoirs en retard
          </Link>
        )}
      </div>
    </section>
  );
}
