import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  ListChecks,
  Plus,
  Sparkles,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

/**
 * Vue prof index /accueil/devoirs (Feedback Alex 2026-05-24).
 *
 * Avant : prof devait naviguer `/accueil → Classes → click classe → liste
 * devoirs de la classe`. Pour voir l'overall il fallait jongler entre classes.
 *
 * Maintenant : "Devoirs" dans sidebar prof → vue agrégée TOUTES classes du
 * prof, groupé par classe, avec KPIs de complétion par devoir.
 *
 * Sécurité : on filtre via `classes.teacher_id = user.id` (RLS double-check
 * côté DB).
 *
 * UX : pas de filtre/tri complexe pour ce MVP — liste chronologique
 * inverse + grouping par classe. Click devoir → page detail prof existante
 * `/accueil/classes/[id]/devoirs/[assignmentId]` (heatmap par défaut depuis
 * PR #120).
 */

type AssignmentItem = {
  id: string;
  title: string;
  description: string | null;
  resource_type: "pdf" | "quiz";
  class_id: string;
  class_name: string;
  due_date: string | null;
  created_at: string;
  total_students: number;
  completed_count: number;
  in_progress_count: number;
  avg_score: number | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-BE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function fetchProfAssignments(userId: string): Promise<AssignmentItem[]> {
  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Classes du prof
  const { data: classes, error: classesErr } = await admin
    .from("classes")
    .select("id, name, archived_at")
    .eq("teacher_id", userId)
    .is("archived_at", null);
  if (classesErr) throw classesErr;
  type ClassRow = { id: string; name: string; archived_at: string | null };
  const classRows = (classes ?? []) as ClassRow[];
  if (classRows.length === 0) return [];

  const classIds = classRows.map((c) => c.id);
  const classNameMap: Record<string, string> = {};
  for (const c of classRows) classNameMap[c.id] = c.name;

  // 2. Devoirs actifs de ces classes
  const { data: assignments, error: aErr } = await admin
    .from("assignments")
    .select("id, title, description, resource_type, class_id, due_date, created_at")
    .in("class_id", classIds)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (aErr) throw aErr;
  type AssignmentRow = {
    id: string;
    title: string;
    description: string | null;
    resource_type: string;
    class_id: string;
    due_date: string | null;
    created_at: string;
  };
  const assignRows = (assignments ?? []) as AssignmentRow[];
  if (assignRows.length === 0) return [];

  // 3. Nb élèves actifs par classe (denominateur completion)
  const { data: memberships } = await admin
    .from("class_memberships")
    .select("class_id, student_user_id")
    .in("class_id", classIds)
    .eq("status", "active");
  const studentsPerClass: Record<string, number> = {};
  for (const m of (memberships ?? []) as { class_id: string }[]) {
    studentsPerClass[m.class_id] = (studentsPerClass[m.class_id] ?? 0) + 1;
  }

  // 4. Completions par devoir
  const assignmentIds = assignRows.map((a) => a.id);
  const { data: completions } = await admin
    .from("assignment_completions")
    .select("assignment_id, status, score")
    .in("assignment_id", assignmentIds);
  type CRow = { assignment_id: string; status: string; score: number | null };
  const completionsByA: Record<
    string,
    { completed: number; in_progress: number; score_sum: number; score_count: number }
  > = {};
  for (const c of (completions ?? []) as CRow[]) {
    if (!completionsByA[c.assignment_id]) {
      completionsByA[c.assignment_id] = {
        completed: 0,
        in_progress: 0,
        score_sum: 0,
        score_count: 0,
      };
    }
    const bucket = completionsByA[c.assignment_id];
    if (c.status === "completed") {
      bucket.completed++;
      if (c.score !== null) {
        bucket.score_sum += Number(c.score);
        bucket.score_count++;
      }
    } else if (c.status === "in_progress") {
      bucket.in_progress++;
    }
  }

  return assignRows.map((a) => {
    const stats = completionsByA[a.id] ?? {
      completed: 0,
      in_progress: 0,
      score_sum: 0,
      score_count: 0,
    };
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      resource_type: (a.resource_type as "pdf" | "quiz") ?? "quiz",
      class_id: a.class_id,
      class_name: classNameMap[a.class_id] ?? "—",
      due_date: a.due_date,
      created_at: a.created_at,
      total_students: studentsPerClass[a.class_id] ?? 0,
      completed_count: stats.completed,
      in_progress_count: stats.in_progress,
      avg_score: stats.score_count > 0 ? Math.round(stats.score_sum / stats.score_count) : null,
    };
  });
}

export default async function ProfDevoirsView({ user }: { user: User }) {
  const items = await fetchProfAssignments(user.id);

  // Group by class for the listing
  const byClass = new Map<string, { name: string; items: AssignmentItem[] }>();
  for (const a of items) {
    if (!byClass.has(a.class_id)) {
      byClass.set(a.class_id, { name: a.class_name, items: [] });
    }
    byClass.get(a.class_id)!.items.push(a);
  }
  const classGroups = Array.from(byClass.entries()).map(([id, g]) => ({
    classId: id,
    name: g.name,
    items: g.items,
  }));

  const totalDevoirs = items.length;
  const totalCompletions = items.reduce((sum, a) => sum + a.completed_count, 0);
  const totalExpected = items.reduce((sum, a) => sum + a.total_students, 0);
  const overallCompletionPct =
    totalExpected > 0 ? Math.round((100 * totalCompletions) / totalExpected) : 0;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 dark:bg-slate-950 sm:px-6" lang="fr-BE">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {/* Hero */}
        <header>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
                Mes devoirs
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Tous mes devoirs, toutes classes
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {totalDevoirs === 0
                  ? "Tu n'as encore créé aucun devoir."
                  : `${totalDevoirs} devoir${totalDevoirs > 1 ? "s" : ""} actif${totalDevoirs > 1 ? "s" : ""} · ${overallCompletionPct}% de complétion globale.`}
              </p>
            </div>
            <Link
              href="/accueil/classes"
              className="
                inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5
                text-xs font-medium text-slate-700 transition
                hover:bg-slate-50
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
                dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800
                dark:focus-visible:ring-offset-slate-950
                motion-reduce:transition-none
              "
            >
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              Créer depuis une classe
            </Link>
          </div>

          {/* KPI compact */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <KpiCard icon={<ListChecks size={16} className="text-indigo-600" />} label="Devoirs actifs" value={totalDevoirs} />
            <KpiCard
              icon={<CheckCircle2 size={16} className="text-emerald-600" />}
              label="Complétions"
              value={`${totalCompletions} / ${totalExpected}`}
            />
            <KpiCard
              icon={<Sparkles size={16} className="text-indigo-600" />}
              label="Classes"
              value={classGroups.length}
            />
          </div>
        </header>

        {/* Empty state */}
        {totalDevoirs === 0 ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <ClipboardList
              size={28}
              strokeWidth={1.5}
              aria-hidden="true"
              className="mx-auto text-slate-400 dark:text-slate-500"
            />
            <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Aucun devoir actif.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Pour créer un devoir : va dans une classe puis &laquo; Nouveau
              devoir &raquo;.
            </p>
            <Link
              href="/accueil/classes"
              className="
                mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2
                text-sm font-semibold text-white transition
                hover:bg-indigo-700
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                focus-visible:ring-offset-2 focus-visible:ring-offset-white
                dark:focus-visible:ring-offset-slate-900
                motion-reduce:transition-none
              "
            >
              Voir mes classes
              <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
            </Link>
          </section>
        ) : (
          // List grouped by class
          classGroups.map((g) => (
            <section
              key={g.classId}
              aria-labelledby={`class-${g.classId}-title`}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <h2
                  id={`class-${g.classId}-title`}
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  {g.name}
                  <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                    {g.items.length} devoir{g.items.length > 1 ? "s" : ""}
                  </span>
                </h2>
                <Link
                  href={`/accueil/classes/${g.classId}`}
                  className="text-xs text-indigo-700 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  Voir la classe →
                </Link>
              </div>

              <ul role="list" className="grid gap-3 sm:grid-cols-2">
                {g.items.map((a) => (
                  <li key={a.id}>
                    <DevoirCard a={a} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </main>
  );
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
      </div>
      <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function DevoirCard({ a }: { a: AssignmentItem }) {
  const completionPct =
    a.total_students > 0 ? Math.round((100 * a.completed_count) / a.total_students) : 0;
  const isOverdue = a.due_date && new Date(a.due_date) < new Date();
  const isQuiz = a.resource_type === "quiz";

  return (
    <Link
      href={`/accueil/classes/${a.class_id}/devoirs/${a.id}`}
      className="
        group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 transition
        hover:border-indigo-300 hover:shadow-sm
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
        focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
        dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700
        dark:focus-visible:ring-offset-slate-950
        motion-reduce:transition-none
      "
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isQuiz ? (
              <Sparkles size={12} strokeWidth={2} className="shrink-0 text-indigo-600" aria-hidden="true" />
            ) : (
              <FileText size={12} strokeWidth={2} className="shrink-0 text-slate-500" aria-hidden="true" />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {isQuiz ? "Quiz" : "PDF"}
            </span>
            {isOverdue ? (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <AlertCircle size={10} strokeWidth={2} aria-hidden="true" />
                En retard
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {a.title}
          </p>
        </div>
        <ArrowRight
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600 motion-reduce:transition-none"
        />
      </div>

      {/* Stats */}
      <div className="mt-3 flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
        <span>
          <strong className="text-slate-900 dark:text-slate-100">
            {a.completed_count}
          </strong>
          {" / "}
          {a.total_students} terminés
        </span>
        {isQuiz && a.avg_score !== null ? (
          <span>
            Moyenne :{" "}
            <strong className="text-slate-900 dark:text-slate-100">{a.avg_score}%</strong>
          </span>
        ) : null}
      </div>

      {/* Progress bar */}
      {a.total_students > 0 ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-indigo-600 transition-all motion-reduce:transition-none"
            style={{ width: `${completionPct}%` }}
            role="progressbar"
            aria-valuenow={completionPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${completionPct}% de complétion`}
          />
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-500">
        <span>Créé le {fmtDate(a.created_at)}</span>
        {a.due_date ? <span>À rendre {fmtDate(a.due_date)}</span> : null}
      </div>
    </Link>
  );
}
