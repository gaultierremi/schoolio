/**
 * Dashboard élève — vue heatmap progression (PR #27).
 *
 * Refonte basée sur docs/dashboard-eleve-heatmap-mockup.html (source de vérité).
 * Le rendu est server-side pour la première peinture (data fetchée via la même
 * logique que /api/student/dashboard/heatmap), puis le composant client gère
 * l'interactivité (sélection sous-classe matière).
 *
 * CLAUDE.md règle 3 : role lu depuis app_metadata (server-trusted).
 */

import { redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { SUPER_ADMIN_EMAILS } from "@/lib/admin-config";
import HeatmapDashboardClient from "./_components/HeatmapDashboardClient";
import type {
  HeatmapData,
  SubjectClass,
  ConceptBucket,
  DailyEffort,
} from "@/lib/types/student-dashboard";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function masteryFor(correct: number, attempts: number): number {
  if (attempts === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((correct / attempts) * 100)));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchHeatmapData(userId: string): Promise<HeatmapData> {
  const admin = createAdminClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoIso = sevenDaysAgo.toISOString();

  const { data: memberships } = await admin
    .from("class_memberships")
    .select("class_id, classes!inner(id, name, level, subject, parent_class_id)")
    .eq("student_user_id", userId)
    .eq("status", "active");

  type MemberRow = {
    class_id: string;
    classes: {
      id: string;
      name: string;
      level: string | null;
      subject: string | null;
      parent_class_id: string | null;
    };
  };
  const memberRows = (memberships ?? []) as unknown as MemberRow[];

  if (memberRows.length === 0) {
    return {
      subject_classes: [],
      weekly_minutes: 0,
      weekly_questions: 0,
      weekly_correct_rate: null,
      daily_effort: [],
      streak_days: 0,
    };
  }

  const parentIds = [
    ...new Set(memberRows.map((r) => r.classes.parent_class_id).filter((v): v is string => !!v)),
  ];
  const parentNameMap: Record<string, string> = {};
  if (parentIds.length > 0) {
    const { data: parents } = await admin.from("classes").select("id, name").in("id", parentIds);
    for (const p of (parents ?? []) as { id: string; name: string }[]) {
      parentNameMap[p.id] = p.name;
    }
  }

  const classIds = memberRows.map((r) => r.class_id);

  const { data: assignments } = await admin
    .from("assignments")
    .select("id, title, class_id, resource_type, resource_id, due_date")
    .in("class_id", classIds)
    .is("archived_at", null);

  type AssignRow = {
    id: string;
    title: string;
    class_id: string;
    resource_type: string;
    resource_id: string;
    due_date: string | null;
  };
  const assignRows = (assignments ?? []) as AssignRow[];
  const assignmentIds = assignRows.map((a) => a.id);

  type AnswerRow = {
    assignment_id: string;
    question_id: string;
    is_correct: boolean;
    created_at: string;
  };
  let answers: AnswerRow[] = [];
  if (assignmentIds.length > 0) {
    const { data } = await admin
      .from("assignment_question_answers")
      .select("assignment_id, question_id, is_correct, created_at")
      .eq("student_user_id", userId)
      .in("assignment_id", assignmentIds);
    answers = (data ?? []) as AnswerRow[];
  }

  const questionIds = [...new Set(answers.map((a) => a.question_id))];
  type TQRow = { id: string; concept_id: string | null };
  let tqRows: TQRow[] = [];
  if (questionIds.length > 0) {
    const { data } = await admin
      .from("teacher_questions")
      .select("id, concept_id")
      .in("id", questionIds);
    tqRows = (data ?? []) as TQRow[];
  }
  const conceptByQuestion: Record<string, string | null> = {};
  for (const tq of tqRows) conceptByQuestion[tq.id] = tq.concept_id;

  const conceptIds = [
    ...new Set(Object.values(conceptByQuestion).filter((v): v is string => !!v)),
  ];
  type ConceptRow = { id: string; name: string };
  let conceptRows: ConceptRow[] = [];
  if (conceptIds.length > 0) {
    const { data } = await admin.from("concepts").select("id, name").in("id", conceptIds);
    conceptRows = (data ?? []) as ConceptRow[];
  }
  const conceptNameMap: Record<string, string> = {};
  for (const c of conceptRows) conceptNameMap[c.id] = c.name;

  const classByAssignment: Record<string, string> = {};
  for (const a of assignRows) classByAssignment[a.id] = a.class_id;
  const assignTitleMap: Record<string, string> = {};
  for (const a of assignRows) assignTitleMap[a.id] = a.title;

  type Stat = { correct: number; attempts: number; last_seen: string | null };
  const bucketStats: Record<string, Record<string, Stat>> = {};
  const bucketLabels: Record<string, Record<string, string>> = {};
  const bucketAssignSet: Record<string, Record<string, Set<string>>> = {};

  const nowMs = now.getTime();
  const horizonMs = 14 * 24 * 60 * 60 * 1000;
  const futureAssignSet = new Set(
    assignRows
      .filter((a) => {
        if (!a.due_date) return false;
        const t = new Date(a.due_date).getTime();
        return t > nowMs && t - nowMs < horizonMs;
      })
      .map((a) => a.id),
  );

  for (const ans of answers) {
    const classId = classByAssignment[ans.assignment_id];
    if (!classId) continue;
    const conceptId = conceptByQuestion[ans.question_id];
    const bucketKey = conceptId ?? `assign:${ans.assignment_id}`;
    const label = conceptId
      ? (conceptNameMap[conceptId] ?? "Concept")
      : (assignTitleMap[ans.assignment_id] ?? "Devoir");

    if (!bucketStats[classId]) bucketStats[classId] = {};
    if (!bucketLabels[classId]) bucketLabels[classId] = {};
    if (!bucketAssignSet[classId]) bucketAssignSet[classId] = {};

    if (!bucketStats[classId][bucketKey]) {
      bucketStats[classId][bucketKey] = { correct: 0, attempts: 0, last_seen: null };
      bucketLabels[classId][bucketKey] = label;
      bucketAssignSet[classId][bucketKey] = new Set();
    }
    const s = bucketStats[classId][bucketKey];
    s.attempts += 1;
    if (ans.is_correct) s.correct += 1;
    if (!s.last_seen || ans.created_at > s.last_seen) s.last_seen = ans.created_at;
    bucketAssignSet[classId][bucketKey].add(ans.assignment_id);
  }

  const subjectClasses: SubjectClass[] = memberRows.map((r) => {
    const cls = r.classes;
    const stats = bucketStats[cls.id] ?? {};
    const labels = bucketLabels[cls.id] ?? {};
    const assignSets = bucketAssignSet[cls.id] ?? {};

    const concepts: ConceptBucket[] = Object.entries(stats).map(([key, s]) => {
      const assignSet = assignSets[key] ?? new Set<string>();
      let priority = false;
      for (const aid of assignSet) {
        if (futureAssignSet.has(aid)) {
          priority = true;
          break;
        }
      }
      return {
        key,
        label: labels[key] ?? "Concept",
        mastery: masteryFor(s.correct, s.attempts),
        attempts: s.attempts,
        correct: s.correct,
        last_seen: s.last_seen,
        priority,
      };
    });

    concepts.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
      return a.mastery - b.mastery;
    });

    let firstPriorityFound = false;
    for (const c of concepts) {
      if (c.priority) {
        if (firstPriorityFound) c.priority = false;
        else firstPriorityFound = true;
      }
    }
    if (!firstPriorityFound && concepts.length > 0 && concepts[0].mastery < 50) {
      concepts[0].priority = true;
    }

    const parentName = cls.parent_class_id ? (parentNameMap[cls.parent_class_id] ?? null) : null;

    return {
      class_id: cls.id,
      class_name: cls.name,
      subject: cls.subject,
      level: cls.level,
      parent_class_name: parentName,
      concepts,
    };
  });

  subjectClasses.sort((a, b) => {
    const aIsSub = !!a.parent_class_name;
    const bIsSub = !!b.parent_class_name;
    if (aIsSub !== bIsSub) return aIsSub ? -1 : 1;
    return a.class_name.localeCompare(b.class_name);
  });

  const weeklyAnswers = answers.filter((a) => a.created_at >= sevenDaysAgoIso);
  const weeklyQuestionsSet = new Set(weeklyAnswers.map((a) => a.question_id));
  const weeklyCorrect = weeklyAnswers.filter((a) => a.is_correct).length;
  const weeklyTotal = weeklyAnswers.length;
  const weeklyCorrectRate = weeklyTotal > 0 ? Math.round((weeklyCorrect / weeklyTotal) * 100) : null;
  const weeklyMinutes = Math.round(weeklyTotal * 0.5);

  const dailyMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dailyMap[isoDate(d)] = 0;
  }
  for (const ans of weeklyAnswers) {
    const d = ans.created_at.slice(0, 10);
    if (dailyMap[d] !== undefined) dailyMap[d] += 1;
  }
  const dailyEffort: DailyEffort[] = Object.entries(dailyMap).map(([date, n]) => ({
    date,
    questions_answered: n,
  }));

  let streakDays = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const day = isoDate(d);
    const count = dailyMap[day];
    if (count !== undefined) {
      if (count > 0) streakDays += 1;
      else if (i === 0) continue;
      else break;
    } else {
      const dayStart = new Date(day + "T00:00:00.000Z").getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const hasActivity = answers.some((a) => {
        const t = new Date(a.created_at).getTime();
        return t >= dayStart && t < dayEnd;
      });
      if (hasActivity) streakDays += 1;
      else break;
    }
  }

  return {
    subject_classes: subjectClasses,
    weekly_minutes: weeklyMinutes,
    weekly_questions: weeklyQuestionsSet.size,
    weekly_correct_rate: weeklyCorrectRate,
    daily_effort: dailyEffort,
    streak_days: streakDays,
  };
}

export default async function StudentPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  // Rule 3: role lives in app_metadata (server-trusted), not user_metadata
  // (which is client-mutable and would let anyone self-promote).
  const role = (user.app_metadata as Record<string, unknown>)?.role;
  const isSuperAdmin =
    !!user.email && (SUPER_ADMIN_EMAILS as readonly string[]).includes(user.email.toLowerCase());
  if (role !== "student" && !isSuperAdmin) redirect("/school");

  const admin = createAdminClient();
  const { data: ownProfile } = await admin
    .from("user_profiles")
    .select("first_name, pseudo")
    .eq("id", user.id)
    .maybeSingle();

  const meta = user.user_metadata as Record<string, unknown>;
  const displayName =
    (ownProfile as { first_name?: string | null; pseudo?: string | null } | null)?.first_name ??
    (meta?.firstName as string | undefined) ??
    (meta?.pseudo as string | undefined) ??
    user.email?.split("@")[0] ??
    "Élève";

  const data = await fetchHeatmapData(user.id);

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))]">
      {/* Top bar */}
      <header
        className="border-b border-[rgb(var(--border))]"
        style={{ background: "rgb(var(--surface))" }}
      >
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgb(var(--accent))] text-xs font-bold text-white">
              M
            </div>
            <span className="serif text-lg font-semibold text-[rgb(var(--ink))]">Maïa</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-[rgb(var(--border))] px-2 py-1">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  background: "rgb(var(--accent) / 0.15)",
                  color: "rgb(var(--accent))",
                }}
              >
                {(displayName.charAt(0) ?? "?").toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-medium leading-tight text-[rgb(var(--ink))]">
                  {displayName}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <HeatmapDashboardClient displayName={displayName} initialData={data} />
    </main>
  );
}
