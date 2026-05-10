import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
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

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const admin = createAdminClient();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const todayDow = now.getDay(); // 0 = dimanche

    // ── 1. Memberships → class ids + teacher ids ──────────────────────────────
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

    // ── 2. Teacher display names ───────────────────────────────────────────────
    const teacherNameMap: Record<string, string> = {};
    if (teacherIds.length > 0) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, user_name, first_name, last_name")
        .in("id", teacherIds);
      for (const p of profiles ?? []) {
        const name =
          p.first_name && p.last_name
            ? `${p.first_name} ${p.last_name}`
            : (p.first_name ?? p.user_name ?? "Prof");
        teacherNameMap[p.id] = name;
      }
    }

    if (classIds.length === 0) {
      const empty: DashboardData = {
        upcoming_assignments: [],
        recent_completions: [],
        today_schedule: [],
        available_courses: [],
        weekly_stats: {
          assignments_completed: 0,
          questions_practiced: 0,
          live_participations: 0,
          avg_grade_letter: null,
        },
      };
      return NextResponse.json(empty);
    }

    // ── 3. All queries in parallel ─────────────────────────────────────────────
    //
    // Note: previously we fetched "available courses" via teacher_id, which
    // exposed every PDF a teacher had ever uploaded across all their classes
    // (audit finding HIGH). The available_courses list is now derived from
    // assignments.resource_id below — only courses the student has been
    // explicitly assigned are visible.
    const [
      assignmentsRes,
      scheduleRes,
      completedCountRes,
      questionsRes,
      livePicksRes,
      recentScoresRes,
      userProfileRes,
    ] = await Promise.all([
      // Assignments (not archived)
      admin
        .from("assignments")
        .select("id, title, resource_id, resource_type, due_date, class_id")
        .in("class_id", classIds)
        .is("archived_at", null)
        .order("due_date", { ascending: true, nullsFirst: false }),

      // Today's schedule
      admin
        .from("teacher_schedule_slots")
        .select("start_time, end_time, subject_label, class_id, teacher_id, week_pattern")
        .in("class_id", classIds)
        .eq("day_of_week", todayDow),

      // Weekly: completed assignments count
      admin
        .from("assignment_completions")
        .select("id", { count: "exact", head: true })
        .eq("student_user_id", user.id)
        .eq("status", "completed")
        .gte("completed_at", sevenDaysAgo),

      // Weekly: questions practiced (distinct question_id)
      admin
        .from("assignment_question_answers")
        .select("question_id")
        .eq("student_user_id", user.id)
        .gte("created_at", sevenDaysAgo),

      // Weekly: live participations
      admin
        .from("student_random_picks")
        .select("id", { count: "exact", head: true })
        .eq("student_user_id", user.id)
        .eq("was_cancelled", false)
        .gte("picked_at", sevenDaysAgo),

      // Weekly: last 5 scores for avg grade
      admin
        .from("assignment_completions")
        .select("score")
        .eq("student_user_id", user.id)
        .eq("status", "completed")
        .not("score", "is", null)
        .gte("completed_at", sevenDaysAgo)
        .order("completed_at", { ascending: false })
        .limit(5),

      // User profile for week_pattern_override
      admin
        .from("user_profiles")
        .select("week_pattern_override")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    // ── 4. Assignments: completions + course titles ────────────────────────────
    type RawAssignment = {
      id: string;
      title: string;
      resource_id: string;
      resource_type: string;
      due_date: string | null;
      class_id: string;
    };
    const rawAssignments = (assignmentsRes.data ?? []) as RawAssignment[];
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

    // Fetch the courses referenced by the student's assignments. This serves
    // both the title lookup AND the available_courses list (replacing the
    // previous teacher_id-scoped query that leaked unrelated PDFs).
    const resourceIds = [...new Set(rawAssignments.map((a) => a.resource_id))];
    const courseTitleMap: Record<string, string> = {};
    type CourseRow = { id: string; title: string; subject_enum: string | null; level: number | null; pdf_storage_path: string | null };
    let assignedCourses: CourseRow[] = [];
    if (resourceIds.length > 0) {
      const { data: coursesData } = await admin
        .from("courses")
        .select("id, title, subject_enum, level, pdf_storage_path")
        .in("id", resourceIds)
        .order("created_at", { ascending: false });
      assignedCourses = (coursesData ?? []) as CourseRow[];
      for (const c of assignedCourses) courseTitleMap[c.id] = c.title ?? "Sans titre";
    }

    const upcomingAssignments: UpcomingAssignment[] = [];
    const recentCompletions: RecentCompletion[] = [];

    for (const a of rawAssignments) {
      const c = completionMap[a.id];
      const dbStatus = c?.status ?? "pending";

      if (dbStatus === "completed") {
        recentCompletions.push({
          id: a.id,
          title: a.title,
          course_title: courseTitleMap[a.resource_id] ?? null,
          class_name: classNameMap[a.class_id] ?? "—",
          completed_at: c!.completed_at!,
          score: c!.score,
        });
      } else {
        const isOverdue = a.due_date != null && new Date(a.due_date) < now;
        const status = isOverdue ? "overdue" : dbStatus === "in_progress" ? "in_progress" : "pending";
        upcomingAssignments.push({
          id: a.id,
          title: a.title,
          course_title: courseTitleMap[a.resource_id] ?? null,
          class_name: classNameMap[a.class_id] ?? "—",
          deadline: a.due_date,
          estimated_minutes: null,
          status,
        });
      }
    }

    // Sort upcoming: overdue first, then by deadline
    upcomingAssignments.sort((a, b) => {
      if (a.status === "overdue" && b.status !== "overdue") return -1;
      if (b.status === "overdue" && a.status !== "overdue") return 1;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });

    // Sort recents by completed_at desc, keep 3
    recentCompletions.sort(
      (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime(),
    );
    const top3Recent = recentCompletions.slice(0, 3);

    // ── 5. Today's schedule ────────────────────────────────────────────────────
    const weekPatternOverride = (userProfileRes.data as { week_pattern_override?: string } | null)
      ?.week_pattern_override ?? "auto";
    const allowedPatterns = ["all"];
    if (weekPatternOverride === "force_A") allowedPatterns.push("A");
    if (weekPatternOverride === "force_B") allowedPatterns.push("B");

    type SlotRow = {
      start_time: string;
      end_time: string;
      subject_label: string | null;
      class_id: string | null;
      teacher_id: string;
      week_pattern: string;
    };

    const todaySlots = ((scheduleRes.data ?? []) as SlotRow[])
      .filter((s) => allowedPatterns.includes(s.week_pattern))
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map<ScheduleSlot>((s) => ({
        time_start: s.start_time.slice(0, 5),
        time_end: s.end_time.slice(0, 5),
        course_title: s.subject_label ?? "Cours",
        room: null,
        teacher_name: teacherNameMap[s.teacher_id] ?? "Prof",
      }));

    // ── 6. Available courses ───────────────────────────────────────────────────
    // Built from assignedCourses (computed above) so a student only sees
    // courses they have actually been assigned. Filtered to those with a PDF.
    const availableCourses: AvailableCourse[] = assignedCourses
      .filter((c): c is CourseRow & { pdf_storage_path: string } => c.pdf_storage_path != null)
      .slice(0, 20)
      .map((c) => ({
        id: c.id,
        title: c.title,
        subject_enum: c.subject_enum,
        level: c.level,
        pdf_storage_path: c.pdf_storage_path,
      }));

    // ── 7. Weekly stats ────────────────────────────────────────────────────────
    const assignmentsCompleted = completedCountRes.count ?? 0;
    const uniqueQuestions = new Set(
      (questionsRes.data ?? []).map((r: { question_id: string }) => r.question_id),
    ).size;
    const liveParticipations = livePicksRes.count ?? 0;

    const scores = (recentScoresRes.data ?? [])
      .map((r: { score: number | null }) => r.score)
      .filter((s): s is number => s !== null);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const avgGradeLetter: LetterGrade | null = avgScore !== null ? scoreToLetter(avgScore) : null;

    const weeklyStats: WeeklyStats = {
      assignments_completed: assignmentsCompleted,
      questions_practiced: uniqueQuestions,
      live_participations: liveParticipations,
      avg_grade_letter: avgGradeLetter,
    };

    const response: DashboardData = {
      upcoming_assignments: upcomingAssignments,
      recent_completions: top3Recent,
      today_schedule: todaySlots,
      available_courses: availableCourses,
      weekly_stats: weeklyStats,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[student/dashboard:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
