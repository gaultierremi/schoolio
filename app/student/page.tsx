import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { SUPER_ADMIN_EMAILS } from "@/lib/admin-config";
import ExplorerFooter from "./_components/ExplorerFooter";
import DashboardHeader from "./_components/DashboardHeader";
import AssignmentList from "./_components/AssignmentList";
import AIChallengeBanner from "./_components/AIChallengeBanner";
import TodaySchedule from "./_components/TodaySchedule";
import CourseList from "./_components/CourseList";
import WeeklyStatsBanner from "./_components/WeeklyStatsBanner";
import type {
  DashboardData,
  UpcomingAssignment,
  RecentCompletion,
  ScheduleSlot,
  AvailableCourse,
  WeeklyStats,
  LetterGrade,
} from "@/lib/types/student-dashboard";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function scoreToLetter(avg: number): LetterGrade {
  if (avg >= 70) return "D";
  if (avg >= 50) return "C";
  return "B";
}

export default async function StudentPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  // Rule 3: role lives in app_metadata (server-trusted), not user_metadata
  // (which is client-mutable and would let anyone self-promote).
  // SUPER_ADMIN bypass : founders see every dashboard regardless of role.
  const role = (user.app_metadata as Record<string, unknown>)?.role;
  const isSuperAdmin =
    !!user.email && (SUPER_ADMIN_EMAILS as readonly string[]).includes(user.email.toLowerCase());
  if (role !== "student" && !isSuperAdmin) redirect("/school");

  const admin = createAdminClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const todayDow = now.getDay();

  // ── Memberships ──────────────────────────────────────────────────────────────
  const { data: memberships } = await admin
    .from("class_memberships")
    .select("class_id, classes!inner(name, teacher_id, level, subject)")
    .eq("student_user_id", user.id)
    .eq("status", "active");

  type MemberRow = {
    class_id: string;
    classes: { name: string; teacher_id: string; level: string | null; subject: string | null };
  };
  const memberRows = (memberships ?? []) as unknown as MemberRow[];
  const classIds = memberRows.map((r) => r.class_id);
  const classNameMap: Record<string, string> = {};
  for (const r of memberRows) classNameMap[r.class_id] = r.classes.name;
  const teacherIds = [...new Set(memberRows.map((r) => r.classes.teacher_id))];

  // ── Teacher names + user profile (display name) ───────────────────────────
  const teacherNameMap: Record<string, string> = {};
  const [teacherProfilesRes, ownProfileRes] = await Promise.all([
    teacherIds.length > 0
      ? admin
          .from("user_profiles")
          .select("id, user_name, first_name, last_name")
          .in("id", teacherIds)
      : Promise.resolve({ data: [] }),
    admin
      .from("user_profiles")
      .select("first_name, pseudo, week_pattern_override")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  for (const p of teacherProfilesRes.data ?? []) {
    teacherNameMap[p.id] =
      p.first_name && p.last_name
        ? `${p.first_name} ${p.last_name}`
        : (p.first_name ?? p.user_name ?? "Prof");
  }

  const ownProfile = ownProfileRes.data as {
    first_name: string | null;
    pseudo: string | null;
    week_pattern_override: string | null;
  } | null;

  const meta = user.user_metadata as Record<string, unknown>;
  const displayName =
    ownProfile?.first_name ??
    (meta?.firstName as string | undefined) ??
    (meta?.pseudo as string | undefined) ??
    user.email?.split("@")[0] ??
    "Élève";

  const primaryClass = memberRows[0]?.classes.name ?? null;

  // ── Parallel queries ──────────────────────────────────────────────────────
  let dashboardData: DashboardData = {
    upcoming_assignments: [],
    recent_completions: [],
    today_schedule: [],
    available_courses: [],
    weekly_stats: { assignments_completed: 0, questions_practiced: 0, avg_grade_letter: null },
  };
  let streak = 0;

  if (classIds.length > 0) {
    const [
      assignmentsRes,
      scheduleRes,
      coursesRes,
      completedCountRes,
      questionsRes,
      recentScoresRes,
    ] = await Promise.allSettled([
      admin
        .from("assignments")
        .select("id, title, resource_id, resource_type, due_date, class_id")
        .in("class_id", classIds)
        .is("archived_at", null)
        .order("due_date", { ascending: true, nullsFirst: false }),

      admin
        .from("teacher_schedule_slots")
        .select("start_time, end_time, subject_label, class_id, teacher_id, week_pattern")
        .in("class_id", classIds)
        .eq("day_of_week", todayDow),

      admin
        .from("courses")
        .select("id, title, subject_enum, level, pdf_storage_path")
        .in("teacher_id", teacherIds)
        .not("pdf_storage_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(20),

      admin
        .from("assignment_completions")
        .select("id", { count: "exact", head: true })
        .eq("student_user_id", user.id)
        .eq("status", "completed")
        .gte("completed_at", sevenDaysAgo),

      admin
        .from("assignment_question_answers")
        .select("question_id")
        .eq("student_user_id", user.id)
        .gte("created_at", sevenDaysAgo),

      admin
        .from("assignment_completions")
        .select("score")
        .eq("student_user_id", user.id)
        .eq("status", "completed")
        .not("score", "is", null)
        .gte("completed_at", sevenDaysAgo)
        .order("completed_at", { ascending: false })
        .limit(5),
    ]);

    // ── Assignments processing ────────────────────────────────────────────
    type RawAssignment = { id: string; title: string; resource_id: string; resource_type: string; due_date: string | null; class_id: string };
    const rawAssignments = assignmentsRes.status === "fulfilled" ? ((assignmentsRes.value.data ?? []) as RawAssignment[]) : [];
    const assignmentIds = rawAssignments.map((a) => a.id);

    const completionMap: Record<string, { status: string; score: number | null; completed_at: string | null }> = {};
    if (assignmentIds.length > 0) {
      const { data: completions } = await admin
        .from("assignment_completions")
        .select("assignment_id, status, score, completed_at")
        .eq("student_user_id", user.id)
        .in("assignment_id", assignmentIds);
      for (const c of completions ?? []) completionMap[c.assignment_id] = c;
    }

    const resourceIds = [...new Set(rawAssignments.map((a) => a.resource_id))];
    const courseTitleMap: Record<string, string> = {};
    if (resourceIds.length > 0) {
      const { data: ct } = await admin.from("courses").select("id, title").in("id", resourceIds);
      for (const c of ct ?? []) courseTitleMap[c.id] = c.title ?? "Sans titre";
    }

    const upcomingAssignments: UpcomingAssignment[] = [];
    const recentCompletions: RecentCompletion[] = [];

    for (const a of rawAssignments) {
      const c = completionMap[a.id];
      const dbStatus = c?.status ?? "pending";
      if (dbStatus === "completed") {
        recentCompletions.push({
          id: a.id, title: a.title, course_title: courseTitleMap[a.resource_id] ?? null,
          class_name: classNameMap[a.class_id] ?? "—", completed_at: c!.completed_at!, score: c!.score,
        });
      } else {
        const isOverdue = a.due_date != null && new Date(a.due_date) < now;
        const status = isOverdue ? "overdue" : dbStatus === "in_progress" ? "in_progress" : "pending";
        upcomingAssignments.push({
          id: a.id, title: a.title, course_title: courseTitleMap[a.resource_id] ?? null,
          class_name: classNameMap[a.class_id] ?? "—", deadline: a.due_date, estimated_minutes: null, status,
        });
      }
    }

    upcomingAssignments.sort((a, b) => {
      if (a.status === "overdue" && b.status !== "overdue") return -1;
      if (b.status === "overdue" && a.status !== "overdue") return 1;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
    recentCompletions.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());

    // ── Schedule ──────────────────────────────────────────────────────────
    const weekPatternOverride = ownProfile?.week_pattern_override ?? "auto";
    const allowedPatterns = ["all"];
    if (weekPatternOverride === "force_A") allowedPatterns.push("A");
    if (weekPatternOverride === "force_B") allowedPatterns.push("B");

    type SlotRow = { start_time: string; end_time: string; subject_label: string | null; class_id: string | null; teacher_id: string; week_pattern: string };
    const rawSlots = scheduleRes.status === "fulfilled" ? ((scheduleRes.value.data ?? []) as SlotRow[]) : [];
    const todaySlots: ScheduleSlot[] = rawSlots
      .filter((s) => allowedPatterns.includes(s.week_pattern))
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((s) => ({
        time_start: s.start_time.slice(0, 5),
        time_end: s.end_time.slice(0, 5),
        course_title: s.subject_label ?? "Cours",
        room: null,
        teacher_name: teacherNameMap[s.teacher_id] ?? "Prof",
      }));

    // ── Courses ───────────────────────────────────────────────────────────
    type CourseRow = { id: string; title: string; subject_enum: string | null; level: number | null; pdf_storage_path: string };
    const availableCourses: AvailableCourse[] = coursesRes.status === "fulfilled"
      ? ((coursesRes.value.data ?? []) as CourseRow[]).map((c) => ({
          id: c.id, title: c.title, subject_enum: c.subject_enum, level: c.level, pdf_storage_path: c.pdf_storage_path,
        }))
      : [];

    // ── Weekly stats ──────────────────────────────────────────────────────
    const assignmentsCompleted = completedCountRes.status === "fulfilled" ? (completedCountRes.value.count ?? 0) : 0;
    const uniqueQuestions = questionsRes.status === "fulfilled"
      ? new Set((questionsRes.value.data ?? []).map((r: { question_id: string }) => r.question_id)).size
      : 0;
    const scores = recentScoresRes.status === "fulfilled"
      ? (recentScoresRes.value.data ?? []).map((r: { score: number | null }) => r.score).filter((s): s is number => s !== null)
      : [];
    const avgScore = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null;
    const avg_grade_letter: LetterGrade | null = avgScore !== null ? scoreToLetter(avgScore) : null;

    const weeklyStats: WeeklyStats = {
      assignments_completed: assignmentsCompleted,
      questions_practiced: uniqueQuestions,
      avg_grade_letter,
    };

    dashboardData = {
      upcoming_assignments: upcomingAssignments,
      recent_completions: recentCompletions.slice(0, 3),
      today_schedule: todaySlots,
      available_courses: availableCourses,
      weekly_stats: weeklyStats,
    };
  }

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8 text-[rgb(var(--ink))]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">

        <DashboardHeader
          displayName={displayName}
          className={primaryClass}
          streak={streak}
        />

        <AssignmentList
          upcoming={dashboardData.upcoming_assignments}
          recent={dashboardData.recent_completions}
        />

        <AIChallengeBanner />

        <TodaySchedule slots={dashboardData.today_schedule} />

        {/* Sprint 0 placeholder — mastery heatmaps rebuilt in Sprint 4 */}
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-5 py-4 text-center">
          <p className="text-sm font-bold text-[rgb(var(--ink-2))]">
            Tableau de bord en cours de construction (Sprint 4)
          </p>
        </div>

        <CourseList courses={dashboardData.available_courses} />

        <WeeklyStatsBanner stats={dashboardData.weekly_stats} />

        <ExplorerFooter />

      </div>
    </main>
  );
}
