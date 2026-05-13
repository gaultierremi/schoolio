import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { computeLetterGrade } from "@/lib/grading";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type CompletionRow = {
  student_user_id: string;
  status: string;
  score: number | null;
  duration_seconds: number | null;
  attempts_count: number;
  last_attempt_at: string | null;
  completed_at: string | null;
  requested_solution: boolean;
  requested_explanation: boolean;
  bonus_questions_completed: number;
};

type AnswerRow = {
  question_id: string;
  is_correct: boolean;
};

type QuestionRow = {
  id: string;
  question: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; assignmentId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    const { data: assignment, error: aErr } = await admin
      .from("assignments")
      .select("id, title, description, resource_type, resource_id, due_date, archived_at, created_at, class_id, assigned_by")
      .eq("id", params.assignmentId)
      .eq("class_id", params.id)
      .eq("assigned_by", user.id)
      .maybeSingle();

    if (aErr) throw aErr;
    if (!assignment) return NextResponse.json({ error: "Devoir introuvable" }, { status: 404 });

    const [membersRes, completionsRes, courseRes, answersRes, assignmentQsRes] = await Promise.all([
      admin
        .from("class_memberships")
        .select("student_user_id, joined_at")
        .eq("class_id", params.id)
        .eq("status", "active"),
      admin
        .from("assignment_completions")
        .select("student_user_id, status, score, duration_seconds, attempts_count, last_attempt_at, completed_at, requested_solution, requested_explanation, bonus_questions_completed")
        .eq("assignment_id", params.assignmentId),
      admin
        .from("courses")
        .select("title")
        .eq("id", assignment.resource_id)
        .maybeSingle(),
      admin
        .from("assignment_question_answers")
        .select("question_id, is_correct")
        .eq("assignment_id", params.assignmentId),
      admin
        .from("assignment_questions")
        .select("is_recall")
        .eq("assignment_id", params.assignmentId),
    ]);

    const members = membersRes.data ?? [];
    const completions = (completionsRes.data ?? []) as CompletionRow[];
    const assignmentQsRows = (assignmentQsRes.data ?? []) as { is_recall: boolean }[];
    const nb_new = assignmentQsRows.filter((r) => !r.is_recall).length;
    const nb_recall = assignmentQsRows.filter((r) => r.is_recall).length;
    const completionByStudent: Record<string, CompletionRow> = {};
    for (const c of completions) completionByStudent[c.student_user_id] = c;

    // Aggregate per-question answer stats
    const answers = (answersRes.data ?? []) as AnswerRow[];
    const questionStats: Record<string, { wrong: number; total: number }> = {};
    for (const a of answers) {
      if (!questionStats[a.question_id]) questionStats[a.question_id] = { wrong: 0, total: 0 };
      questionStats[a.question_id].total++;
      if (!a.is_correct) questionStats[a.question_id].wrong++;
    }

    // Top 10 questions by wrong count (only questions with at least 1 wrong)
    const topQuestionIds = Object.entries(questionStats)
      .filter(([, s]) => s.wrong > 0)
      .sort((a, b) => b[1].wrong - a[1].wrong)
      .slice(0, 10)
      .map(([id]) => id);

    let topErrors: { question_id: string; question: string; wrong_count: number; total_answers: number; error_rate: number }[] = [];
    if (topQuestionIds.length > 0) {
      const { data: qRows } = await admin
        .from("teacher_questions")
        .select("id, question")
        .in("id", topQuestionIds);
      const qMap = new Map<string, string>();
      for (const q of (qRows ?? []) as QuestionRow[]) qMap.set(q.id, q.question);
      topErrors = topQuestionIds.map((qid) => {
        const s = questionStats[qid];
        return {
          question_id: qid,
          question: qMap.get(qid) ?? "—",
          wrong_count: s.wrong,
          total_answers: s.total,
          error_rate: s.total > 0 ? Math.round((s.wrong / s.total) * 100) : 0,
        };
      });
    }

    // Get student profiles
    const studentIds = members.map((m) => m.student_user_id);
    type ProfileRow = { id: string; first_name: string | null; last_name: string | null; user_name: string | null };
    const profileMap = new Map<string, ProfileRow>();
    if (studentIds.length > 0) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, user_name")
        .in("id", studentIds);
      for (const p of (profiles ?? []) as ProfileRow[]) profileMap.set(p.id, p);
    }

    function buildDisplayName(p: ProfileRow | undefined): string {
      if (!p) return "—";
      if (p.first_name) return [p.first_name, p.last_name].filter(Boolean).join(" ");
      return p.user_name ?? "—";
    }

    const students = members
      .map((m) => {
        const c = completionByStudent[m.student_user_id];
        const p = profileMap.get(m.student_user_id);
        return {
          student_user_id: m.student_user_id,
          display_name: buildDisplayName(p),
          status: c?.status ?? "pending",
          score: c?.score ?? null,
          duration_seconds: c?.duration_seconds ?? null,
          attempts_count: c?.attempts_count ?? 0,
          last_attempt_at: c?.last_attempt_at ?? null,
          completed_at: c?.completed_at ?? null,
          requested_solution: c?.requested_solution ?? false,
          requested_explanation: c?.requested_explanation ?? false,
          bonus_questions_completed: c?.bonus_questions_completed ?? 0,
          letter_grade: computeLetterGrade(c ? { status: c.status, score: c.score } : null),
          _sortLast: (p?.last_name ?? "").toLowerCase(),
          _sortFirst: (p?.first_name ?? p?.user_name ?? "").toLowerCase(),
        };
      })
      .sort((a, b) => {
        const lc = a._sortLast.localeCompare(b._sortLast, "fr", { sensitivity: "base" });
        if (lc !== 0) return lc;
        return a._sortFirst.localeCompare(b._sortFirst, "fr", { sensitivity: "base" });
      })
      .map(({ _sortLast: _l, _sortFirst: _f, ...rest }) => rest);

    // Overview aggregates
    const completedStudents = students.filter((s) => s.status === "completed");
    const scores = completedStudents.map((s) => Number(s.score)).filter((n) => !isNaN(n) && n !== null);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const gradeDist = { A: 0, B: 0, C: 0, D: 0 } as Record<string, number>;
    for (const s of students) gradeDist[s.letter_grade] = (gradeDist[s.letter_grade] ?? 0) + 1;

    const overview = {
      nb_total: students.length,
      nb_completed: completedStudents.length,
      avg_score: avgScore,
      grade_dist: gradeDist,
      nb_requested_solution: students.filter((s) => s.requested_solution).length,
      nb_requested_explanation: students.filter((s) => s.requested_explanation).length,
      nb_new: assignmentQsRows.length > 0 ? nb_new : null,
      nb_recall: assignmentQsRows.length > 0 ? nb_recall : null,
    };

    return NextResponse.json({
      assignment: { ...assignment, course_title: courseRes.data?.title ?? "—" },
      overview,
      students,
      top_errors: topErrors,
    });
  } catch (err) {
    console.error("[assignment/dashboard:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
