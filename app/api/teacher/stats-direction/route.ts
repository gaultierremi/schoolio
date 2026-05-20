/**
 * GET /api/teacher/stats-direction
 *
 * Sprint 6 PR S6-12 — Stats direction agrégées pour le prof / direction.
 *
 * Retourne pour chaque classe possédée par le prof :
 *  - Effectif actif (memberships status='active')
 *  - Score moyen sur tous les devoirs (assignment_completions.score)
 *  - Mastery moyen sur toutes les réponses (assignment_question_answers)
 *  - % devoirs terminés (completed_count / total_assignments × students)
 *
 * Aussi : top 5 concepts les plus faibles (mastery < 50%) cross-classes
 * du prof, pour identifier remédiation système.
 *
 * Auth : requireTeacher.
 * Tenant : toutes les classes filtrées par teacher_id = user.id.
 *
 * Pas d'IA runtime — pures agrégations Postgrest.
 */

import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiOk, safeError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const teacher = auth.user;

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Récupère school_id du prof pour tenant filter sur les jointures
    // teacher_questions / concepts (hot-fix hard review B2 — service_role
    // bypass RLS, on doit filtrer manuellement).
    const profileRes = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", teacher.id)
      .maybeSingle();
    if (profileRes.error) throw profileRes.error;
    const schoolId = (profileRes.data as { school_id?: string } | null)?.school_id;
    if (!schoolId) return apiOk({ ok: true, classes: [], topWeakConcepts: [], totals: { students: 0, assignments: 0, completions: 0 } });

    // 1. Classes du prof (non-archivées)
    const classesRes = await admin
      .from("classes")
      .select("id, name, level, subject")
      .eq("teacher_id", teacher.id)
      .is("archived_at", null)
      .order("name", { ascending: true });
    if (classesRes.error) throw classesRes.error;
    const classes =
      (classesRes.data as { id: string; name: string; level: string | null; subject: string | null }[] | null) ?? [];

    if (classes.length === 0) {
      return apiOk({
        ok: true,
        classes: [],
        topWeakConcepts: [],
        totals: { students: 0, assignments: 0, completions: 0 },
      });
    }

    const classIds = classes.map((c) => c.id);

    // 2. Memberships actifs par classe (effectifs)
    const membershipsRes = await admin
      .from("class_memberships")
      .select("class_id, student_user_id")
      .in("class_id", classIds)
      .eq("status", "active");
    if (membershipsRes.error) throw membershipsRes.error;
    type Membership = { class_id: string; student_user_id: string };
    const memberships = (membershipsRes.data as Membership[] | null) ?? [];

    const studentsByClass = new Map<string, Set<string>>();
    for (const m of memberships) {
      const set = studentsByClass.get(m.class_id) ?? new Set<string>();
      set.add(m.student_user_id);
      studentsByClass.set(m.class_id, set);
    }

    // 3. Assignments par classe
    const assignmentsRes = await admin
      .from("assignments")
      .select("id, class_id")
      .in("class_id", classIds)
      .is("archived_at", null);
    if (assignmentsRes.error) throw assignmentsRes.error;
    type AssignmentRow = { id: string; class_id: string };
    const assignments = (assignmentsRes.data as AssignmentRow[] | null) ?? [];

    const assignmentsByClass = new Map<string, string[]>();
    for (const a of assignments) {
      const arr = assignmentsByClass.get(a.class_id) ?? [];
      arr.push(a.id);
      assignmentsByClass.set(a.class_id, arr);
    }

    // 4. Completions (status, score) pour tous ces assignments
    const allAssignmentIds = assignments.map((a) => a.id);
    let completions: { assignment_id: string; student_user_id: string; status: string; score: number | null }[] = [];
    if (allAssignmentIds.length > 0) {
      const completionsRes = await admin
        .from("assignment_completions")
        .select("assignment_id, student_user_id, status, score")
        .in("assignment_id", allAssignmentIds);
      if (completionsRes.error) throw completionsRes.error;
      completions = (completionsRes.data as typeof completions | null) ?? [];
    }

    // 5. Toutes les réponses élèves sur les devoirs (pour mastery)
    let answers: { assignment_id: string; question_id: string; is_correct: boolean }[] = [];
    if (allAssignmentIds.length > 0) {
      const answersRes = await admin
        .from("assignment_question_answers")
        .select("assignment_id, question_id, is_correct")
        .in("assignment_id", allAssignmentIds);
      if (answersRes.error) throw answersRes.error;
      answers = (answersRes.data as typeof answers | null) ?? [];
    }

    // 6. Construire les stats par classe
    type ClassStats = {
      class_id: string;
      name: string;
      level: string | null;
      subject: string | null;
      student_count: number;
      assignments_count: number;
      completions_done: number;
      avg_score: number | null;
      avg_mastery_pct: number | null;
      participation_pct: number;
    };

    const assignmentIdToClass = new Map<string, string>();
    for (const a of assignments) assignmentIdToClass.set(a.id, a.class_id);

    const classStats: ClassStats[] = classes.map((cls) => {
      const studentCount = studentsByClass.get(cls.id)?.size ?? 0;
      const classAssignments = assignmentsByClass.get(cls.id) ?? [];
      const classCompletions = completions.filter((c) => assignmentIdToClass.get(c.assignment_id) === cls.id);
      const completionsDone = classCompletions.filter((c) => c.status === "completed").length;

      const scoresArr = classCompletions
        .map((c) => c.score)
        .filter((s): s is number => s !== null);
      const avgScore =
        scoresArr.length === 0 ? null : Math.round(scoresArr.reduce((a, b) => a + b, 0) / scoresArr.length);

      const classAnswers = answers.filter((a) => assignmentIdToClass.get(a.assignment_id) === cls.id);
      const totalAns = classAnswers.length;
      const correctAns = classAnswers.filter((a) => a.is_correct).length;
      const avgMastery = totalAns === 0 ? null : Math.round((100 * correctAns) / totalAns);

      // Participation = % d'élèves qui ont au moins commencé un devoir
      const studentsWithCompletion = new Set(classCompletions.map((c) => c.student_user_id));
      const participationPct =
        studentCount === 0 ? 0 : Math.round((100 * studentsWithCompletion.size) / studentCount);

      return {
        class_id: cls.id,
        name: cls.name,
        level: cls.level,
        subject: cls.subject,
        student_count: studentCount,
        assignments_count: classAssignments.length,
        completions_done: completionsDone,
        avg_score: avgScore,
        avg_mastery_pct: avgMastery,
        participation_pct: participationPct,
      };
    });

    // 7. Top 5 concepts faibles cross-classes (mastery moyen < 50%)
    // On joint sur teacher_questions.concept_id pour grouper par concept
    type QRow = { id: string; concept_id: string | null };
    let questionToConcept = new Map<string, string>();
    if (answers.length > 0) {
      const qIds = [...new Set(answers.map((a) => a.question_id))];
      const qRes = await admin
        .from("teacher_questions")
        .select("id, concept_id")
        .in("id", qIds)
        .eq("school_id", schoolId) // B2 hot-fix : tenant filter explicite
        .not("concept_id", "is", null);
      if (qRes.error) throw qRes.error;
      const qRows = (qRes.data as QRow[] | null) ?? [];
      questionToConcept = new Map(
        qRows.filter((q) => q.concept_id).map((q) => [q.id, q.concept_id as string]),
      );
    }

    const conceptStats = new Map<string, { correct: number; total: number }>();
    for (const ans of answers) {
      const conceptId = questionToConcept.get(ans.question_id);
      if (!conceptId) continue;
      const s = conceptStats.get(conceptId) ?? { correct: 0, total: 0 };
      s.total += 1;
      if (ans.is_correct) s.correct += 1;
      conceptStats.set(conceptId, s);
    }

    // Top 5 concepts avec mastery_pct < 50 ET total >= 5 (échantillon significatif)
    const weakConceptEntries = Array.from(conceptStats.entries())
      .filter(([, s]) => s.total >= 5)
      .map(([concept_id, s]) => ({
        concept_id,
        mastery_pct: Math.round((100 * s.correct) / s.total),
        total_answers: s.total,
      }))
      .filter((e) => e.mastery_pct < 50)
      .sort((a, b) => a.mastery_pct - b.mastery_pct)
      .slice(0, 5);

    let topWeakConcepts: {
      concept_id: string;
      name: string;
      mastery_pct: number;
      total_answers: number;
    }[] = [];
    if (weakConceptEntries.length > 0) {
      const cIds = weakConceptEntries.map((e) => e.concept_id);
      const conceptsRes = await admin
        .from("concepts")
        .select("id, name")
        .in("id", cIds)
        .eq("school_id", schoolId); // B2 hot-fix : tenant filter explicite
      if (conceptsRes.error) throw conceptsRes.error;
      const conceptsMap = new Map(
        ((conceptsRes.data as { id: string; name: string }[] | null) ?? []).map((c) => [c.id, c.name]),
      );
      topWeakConcepts = weakConceptEntries.map((e) => ({
        concept_id: e.concept_id,
        name: conceptsMap.get(e.concept_id) ?? "Concept",
        mastery_pct: e.mastery_pct,
        total_answers: e.total_answers,
      }));
    }

    return apiOk({
      ok: true,
      classes: classStats,
      topWeakConcepts,
      totals: {
        students: new Set(memberships.map((m) => m.student_user_id)).size,
        assignments: assignments.length,
        completions: completions.filter((c) => c.status === "completed").length,
      },
    });
  } catch (err) {
    return safeError(err, "stats-direction", "Erreur lors du chargement des stats");
  }
}
