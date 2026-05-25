import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { isValidUuid } from "@/lib/curation/validation";

export const runtime = "nodejs";

/**
 * GET /api/classes/[id]/heatmap-data
 *
 * Heatmap concept × élève au niveau CLASSE (toutes assignments aggregées).
 *
 * Différent de `/api/classes/[id]/assignments/[assignmentId]/heatmap-data` :
 * celui-ci aggrège les `assignment_question_answers` sur TOUS les devoirs
 * actifs de la classe pour donner une vue overall mastery par concept et
 * par élève.
 *
 * Cas où la même question apparaît dans plusieurs devoirs : on garde la
 * DERNIÈRE réponse (par `created_at` desc) — pas de double-counting.
 *
 * Auth :
 * - requireTeacher (rôle teacher requis)
 * - Le prof doit posséder la classe (check teacher_id explicite)
 *
 * Response shape (identique à per-assignment) :
 * {
 *   ok: true,
 *   concepts: [{ id, name, slug }],
 *   students: [{ user_id, display_name, status, masteries: number[] }],
 *   classAverage: number[]
 * }
 *
 * `status` au niveau classe :
 * - "completed"   : a terminé >=1 devoir
 * - "in_progress" : a commencé sans tout terminer
 * - "not_started" : aucune réponse enregistrée
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (!isValidUuid(params.id)) {
    return apiError("ID invalide", 400);
  }

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1. Vérifier propriété de la classe
    const { data: classRow } = await admin
      .from("classes")
      .select("id, teacher_id")
      .eq("id", params.id)
      .maybeSingle();
    if (!classRow) return apiError("Classe introuvable", 404);
    if ((classRow as { teacher_id: string }).teacher_id !== user.id) {
      return apiError("Accès refusé : cette classe n'est pas à vous", 403);
    }

    // 2. Tous les devoirs actifs de la classe
    const { data: assignmentsData } = await admin
      .from("assignments")
      .select("id")
      .eq("class_id", params.id)
      .is("archived_at", null);
    const assignmentIds =
      (assignmentsData as { id: string }[] | null)?.map((a) => a.id) ?? [];

    if (assignmentIds.length === 0) {
      return apiOk({ ok: true, concepts: [], students: [], classAverage: [] });
    }

    // 3. Toutes les questions de ces devoirs
    const { data: aqData } = await admin
      .from("assignment_questions")
      .select("question_id")
      .in("assignment_id", assignmentIds);
    const questionIds = Array.from(
      new Set(
        (aqData as { question_id: string }[] | null)?.map((r) => r.question_id) ?? [],
      ),
    );
    if (questionIds.length === 0) {
      return apiOk({ ok: true, concepts: [], students: [], classAverage: [] });
    }

    // 4. Mapping question -> concept (skip questions sans concept_id)
    const { data: questionConceptData } = await admin
      .from("teacher_questions")
      .select("id, concept_id")
      .in("id", questionIds)
      .not("concept_id", "is", null);
    const questionIdToConceptId = new Map<string, string>();
    for (const row of (questionConceptData as { id: string; concept_id: string }[] | null) ?? []) {
      questionIdToConceptId.set(row.id, row.concept_id);
    }

    const conceptIdSet = new Set(questionIdToConceptId.values());
    if (conceptIdSet.size === 0) {
      return apiOk({ ok: true, concepts: [], students: [], classAverage: [] });
    }

    // 5. Concepts (ordonnés alphabétiquement)
    const { data: conceptsData } = await admin
      .from("concepts")
      .select("id, name, slug")
      .in("id", Array.from(conceptIdSet))
      .order("name", { ascending: true });
    const concepts =
      (conceptsData as { id: string; name: string; slug: string }[] | null) ?? [];
    const conceptIdToIndex = new Map(concepts.map((c, i) => [c.id, i]));

    // 6. Élèves actifs de la classe
    const { data: membershipsData } = await admin
      .from("class_memberships")
      .select("student_user_id")
      .eq("class_id", params.id)
      .eq("status", "active");
    const studentIds =
      (membershipsData as { student_user_id: string }[] | null)?.map((m) => m.student_user_id) ?? [];

    if (studentIds.length === 0) {
      return apiOk({ ok: true, concepts, students: [], classAverage: concepts.map(() => 0) });
    }

    // 7. Profils + completions + answers (en parallèle)
    const [profilesRes, completionsRes, answersRes] = await Promise.all([
      admin
        .from("user_profiles")
        .select("id, first_name, last_name, pseudo")
        .in("id", studentIds),
      admin
        .from("assignment_completions")
        .select("student_user_id, status")
        .in("assignment_id", assignmentIds)
        .in("student_user_id", studentIds),
      // Tri par created_at desc pour pouvoir picker la DERNIERE reponse
      // pour chaque (student, question) en cas de doublon entre devoirs.
      admin
        .from("assignment_question_answers")
        .select("student_user_id, question_id, is_correct, created_at")
        .in("assignment_id", assignmentIds)
        .in("student_user_id", studentIds)
        .order("created_at", { ascending: false }),
    ]);

    type Profile = {
      id: string;
      first_name: string | null;
      last_name: string | null;
      pseudo: string | null;
    };
    const profileMap = new Map<string, Profile>(
      ((profilesRes.data as Profile[] | null) ?? []).map((p) => [p.id, p]),
    );

    // 8. Status agrégé classe (priorité completed > in_progress > not_started)
    type CompletionRow = { student_user_id: string; status: string };
    const statusByStudent = new Map<string, "completed" | "in_progress" | "not_started">();
    for (const c of (completionsRes.data as CompletionRow[] | null) ?? []) {
      const existing = statusByStudent.get(c.student_user_id);
      if (c.status === "completed") {
        statusByStudent.set(c.student_user_id, "completed");
      } else if (c.status === "in_progress" && existing !== "completed") {
        statusByStudent.set(c.student_user_id, "in_progress");
      }
    }

    // 9. Dedupe answers : garder UNE réponse par (student, question) = la plus récente
    type AnswerRow = {
      student_user_id: string;
      question_id: string;
      is_correct: boolean;
      created_at: string;
    };
    const allAnswers = (answersRes.data as AnswerRow[] | null) ?? [];
    const latestByKey = new Map<string, AnswerRow>();
    for (const a of allAnswers) {
      // Données déjà triées desc par created_at -> première rencontre = la plus récente
      const key = `${a.student_user_id}:${a.question_id}`;
      if (!latestByKey.has(key)) {
        latestByKey.set(key, a);
      }
    }

    // 10. Agrégation (student × concept) → {correct, total}
    type Stats = { correct: number; total: number };
    const studentConcept = new Map<string, Map<string, Stats>>();
    for (const answer of latestByKey.values()) {
      const conceptId = questionIdToConceptId.get(answer.question_id);
      if (!conceptId || !conceptIdToIndex.has(conceptId)) continue;
      let perStudent = studentConcept.get(answer.student_user_id);
      if (!perStudent) {
        perStudent = new Map();
        studentConcept.set(answer.student_user_id, perStudent);
      }
      const stats = perStudent.get(conceptId) ?? { correct: 0, total: 0 };
      stats.total += 1;
      if (answer.is_correct) stats.correct += 1;
      perStudent.set(conceptId, stats);
    }

    // 11. students[] avec masteries
    const students = studentIds.map((studentId) => {
      const profile = profileMap.get(studentId);
      const display =
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
        profile?.pseudo ||
        "Élève";
      const masteries = concepts.map((c) => {
        const stats = studentConcept.get(studentId)?.get(c.id);
        if (!stats || stats.total === 0) return 0;
        return Math.round((100 * stats.correct) / stats.total);
      });
      const status = statusByStudent.get(studentId) ?? "not_started";
      return { user_id: studentId, display_name: display, status, masteries };
    });

    // 12. Class average
    const classAverage = concepts.map((c) => {
      let totalCorrect = 0;
      let totalAnswered = 0;
      for (const perStudent of studentConcept.values()) {
        const stats = perStudent.get(c.id);
        if (stats) {
          totalCorrect += stats.correct;
          totalAnswered += stats.total;
        }
      }
      return totalAnswered === 0 ? 0 : Math.round((100 * totalCorrect) / totalAnswered);
    });

    return apiOk({ ok: true, concepts, students, classAverage });
  } catch (err) {
    return safeError(err, "class-heatmap-data", "Erreur lors du chargement de la heatmap");
  }
}
