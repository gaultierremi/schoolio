/**
 * Interface devoirs élève (distincte du quiz d'entraînement).
 *
 * UX : 3 sections — Devoirs à faire (deadline future), En retard, Terminés.
 * Mockup source : docs/dashboard-eleve-session-mockup.html (header session
 * adaptive) — mais ici on est sur la vue index, pas la vue exercice. La vue
 * exercice (session adaptive) reste sur /accueil/devoirs/[id]/quiz.
 *
 * CLAUDE.md règle 3 : role lu depuis app_metadata.
 */

import Link from "next/link";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireStudentPage } from "@/lib/auth/role";
import { ArrowLeft, CheckCircle2, AlertTriangle, ListChecks } from "lucide-react";
import AssignmentCard from "@/app/accueil/_components/eleve/AssignmentCard";
import type { AssignmentItem } from "@/lib/types/student-dashboard";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function fetchAssignments(userId: string): Promise<AssignmentItem[]> {
  const admin = createAdminClient();

  const { data: memberships } = await admin
    .from("class_memberships")
    .select("class_id, classes!inner(name, subject)")
    .eq("student_user_id", userId)
    .eq("status", "active");

  type MemberRow = { class_id: string; classes: { name: string; subject: string | null } };
  const rows = (memberships ?? []) as unknown as MemberRow[];
  if (rows.length === 0) return [];

  const classIds = rows.map((m) => m.class_id);
  const classNameMap: Record<string, string> = {};
  const classSubjectMap: Record<string, string | null> = {};
  for (const m of rows) {
    classNameMap[m.class_id] = m.classes.name;
    classSubjectMap[m.class_id] = m.classes.subject;
  }

  const { data: assignments } = await admin
    .from("assignments")
    .select("id, title, description, resource_type, resource_id, due_date, class_id")
    .in("class_id", classIds)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  type AssignmentRow = {
    id: string;
    title: string;
    description: string | null;
    resource_type: string;
    resource_id: string;
    due_date: string | null;
    class_id: string;
  };
  const assignRows = (assignments ?? []) as AssignmentRow[];
  if (assignRows.length === 0) return [];

  const assignmentIds = assignRows.map((a) => a.id);
  const { data: completions } = await admin
    .from("assignment_completions")
    .select("assignment_id, status, score, attempts_count, completed_at, last_attempt_at")
    .eq("student_user_id", userId)
    .in("assignment_id", assignmentIds);

  type CompletionRow = {
    assignment_id: string;
    status: string;
    score: number | null;
    attempts_count: number;
    completed_at: string | null;
    last_attempt_at: string | null;
  };
  const completionMap: Record<string, CompletionRow> = {};
  for (const c of (completions ?? []) as CompletionRow[]) {
    completionMap[c.assignment_id] = c;
  }

  const resourceIds = [...new Set(assignRows.map((a) => a.resource_id))];
  const courseTitleMap: Record<string, string> = {};
  if (resourceIds.length > 0) {
    const { data: courses } = await admin.from("courses").select("id, title").in("id", resourceIds);
    for (const c of (courses ?? []) as { id: string; title: string | null }[]) {
      courseTitleMap[c.id] = c.title ?? "Sans titre";
    }
  }

  const now = new Date();
  const items: AssignmentItem[] = assignRows.map((a) => {
    const c = completionMap[a.id];
    const dbStatus = c?.status ?? "pending";
    let status: AssignmentItem["status"] = "pending";
    if (dbStatus === "completed") status = "completed";
    else if (a.due_date && new Date(a.due_date) < now) status = "overdue";
    else if (dbStatus === "in_progress") status = "in_progress";

    return {
      id: a.id,
      title: a.title,
      description: a.description,
      resource_type: (a.resource_type as "pdf" | "quiz") ?? "quiz",
      course_title: courseTitleMap[a.resource_id] ?? null,
      class_id: a.class_id,
      class_name: classNameMap[a.class_id] ?? "—",
      subject: classSubjectMap[a.class_id] ?? null,
      due_date: a.due_date,
      status,
      score: c?.score ?? null,
      attempts_count: c?.attempts_count ?? 0,
      completed_at: c?.completed_at ?? null,
      last_attempt_at: c?.last_attempt_at ?? null,
    };
  });

  return items;
}

export default async function DevoirsIndexPage() {
  const { user } = await requireStudentPage();

  const items = await fetchAssignments(user.id);

  const todo = items
    .filter((a) => a.status === "pending" || a.status === "in_progress")
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  const overdue = items
    .filter((a) => a.status === "overdue")
    .sort((a, b) => new Date(a.due_date ?? 0).getTime() - new Date(b.due_date ?? 0).getTime());
  const completed = items
    .filter((a) => a.status === "completed")
    .sort(
      (a, b) =>
        new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime(),
    )
    .slice(0, 12);

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))]">
      {/* Top bar */}
      <header
        className="border-b border-[rgb(var(--border))]"
        style={{ background: "rgb(var(--surface))" }}
      >
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/accueil"
            className="flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))]"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Mon espace
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgb(var(--accent))] text-xs font-bold text-white">
              M
            </div>
            <span className="serif text-lg font-semibold text-[rgb(var(--ink))]">Maïa</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1100px] space-y-8 px-4 py-8 sm:px-6">
        {/* Hero */}
        <div>
          <h1 className="serif text-3xl font-semibold text-[rgb(var(--ink))] sm:text-4xl">
            Mes devoirs
          </h1>
          <p className="mt-2 text-base text-[rgb(var(--ink-2))]">
            {todo.length === 0 && overdue.length === 0
              ? "Tu n'as aucun devoir en attente. Profites-en !"
              : `${todo.length + overdue.length} devoir${todo.length + overdue.length > 1 ? "s" : ""} en cours.`}
          </p>
        </div>

        {/* Stats compact */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={<ListChecks className="h-4 w-4 text-[rgb(var(--accent))]" aria-hidden />}
            label="À faire"
            value={todo.length}
            tone="accent"
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4 text-[rgb(239_68_68)]" aria-hidden />}
            label="En retard"
            value={overdue.length}
            tone="danger"
          />
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4 text-[rgb(34_197_94)]" aria-hidden />}
            label="Terminés"
            value={completed.length}
            tone="success"
          />
        </div>

        {/* Section : en retard */}
        {overdue.length > 0 && (
          <section>
            <h2 className="serif mb-3 flex items-center gap-2 text-xl font-semibold text-[rgb(var(--ink))]">
              <AlertTriangle className="h-5 w-5 text-[rgb(239_68_68)]" aria-hidden />
              En retard
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {overdue.map((a) => (
                <AssignmentCard key={a.id} assignment={a} />
              ))}
            </div>
          </section>
        )}

        {/* Section : à faire */}
        <section>
          <h2 className="serif mb-3 text-xl font-semibold text-[rgb(var(--ink))]">À faire</h2>
          {todo.length === 0 ? (
            <div className="card flex flex-col items-center gap-3 p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-[rgb(34_197_94)]" aria-hidden />
              <p className="serif text-lg font-semibold text-[rgb(var(--ink))]">
                Tout est à jour
              </p>
              <p className="max-w-sm text-sm text-[rgb(var(--ink-2))]">
                Tu n&apos;as aucun devoir à faire pour le moment. Continue tes révisions sur le
                tableau de bord pour anticiper.
              </p>
              <Link
                href="/accueil"
                className="btn-primary mt-2 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Voir mon tableau de bord
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {todo.map((a) => (
                <AssignmentCard key={a.id} assignment={a} />
              ))}
            </div>
          )}
        </section>

        {/* Section : terminés */}
        {completed.length > 0 && (
          <section className="pb-8">
            <h2 className="serif mb-3 flex items-center gap-2 text-xl font-semibold text-[rgb(var(--ink))]">
              <CheckCircle2 className="h-5 w-5 text-[rgb(34_197_94)]" aria-hidden />
              Terminés récemment
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {completed.map((a) => (
                <AssignmentCard key={a.id} assignment={a} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "accent" | "danger" | "success";
}) {
  const valueColor =
    tone === "danger"
      ? "text-[rgb(239_68_68)]"
      : tone === "success"
      ? "text-[rgb(34_197_94)]"
      : "text-[rgb(var(--accent))]";
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center gap-2">
        {icon}
        <p className="text-xs uppercase tracking-wide text-[rgb(var(--ink-3))]">{label}</p>
      </div>
      <p className={`serif text-2xl font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}
