import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { isValidUuid } from "@/lib/curation/validation";

export const runtime = "nodejs";

/**
 * GET /api/classes/[id]/assignments/[assignmentId]/heatmap-data
 *
 * Sprint 3 PR S3-1 — Données pour la heatmap prof devoir concept × élève.
 *
 * Retourne l'agrégation mastery % par (concept, élève) pour ce devoir, plus
 * la moyenne classe par concept et la liste des élèves (avec status).
 *
 * Cohérent avec mockup `docs/dashboard-prof-heatmap-mockup.html`.
 *
 * Auth :
 * - requireTeacher (rôle teacher requis)
 * - Le prof doit posséder la classe (check teacher_id explicite)
 *
 * Response shape :
 * {
 *   ok: true,
 *   concepts: [{ id, name, slug }],
 *   students: [{ user_id, display_name, status, masteries: number[] }],
 *   classAverage: number[]   // 1 valeur par concept, dans le même ordre
 * }
 *
 * masteries[i] et classAverage[i] correspondent à concepts[i].
 * Valeur 0 = non évalué (élève n'a pas répondu à des questions sur ce concept).
 *
 * Scale 500 profs / 30 élèves / 100 questions : 6 requêtes séquentielles,
 * agrégation O(M) en mémoire via Map. < 200 ms attendu.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string; assignmentId: string } },
) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (!isValidUuid(params.id) || !isValidUuid(params.assignmentId)) {
    return apiError("ID invalide", 400);
  }

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1. Vérifier que le prof possède la classe + le devoir lié
    const { data: classRow } = await admin
      .from("classes")
      .select("id, teacher_id")
      .eq("id", params.id)
      .maybeSingle();
    if (!classRow) return apiError("Classe introuvable", 404);
    if ((classRow as { teacher_id: string }).teacher_id !== user.id) {
      return apiError("Accès refusé : cette classe n'est pas à vous", 403);
    }

    const { data: assignmentRow } = await admin
      .from("assignments")
      .select("id, class_id")
      .eq("id", params.assignmentId)
      .maybeSingle();
    if (!assignmentRow) return apiError("Devoir introuvable", 404);
    if ((assignmentRow as { class_id: string }).class_id !== params.id) {
      return apiError("Devoir non lié à cette classe", 404);
    }

    // 2. IDs des questions du devoir
    const { data: assignmentQuestions } = await admin
      .from("assignment_questions")
      .select("question_id")
      .eq("assignment_id", params.assignmentId);
    const questionIds =
      (assignmentQuestions as { question_id: string }[] | null)?.map((r) => r.question_id) ?? [];

    if (questionIds.length === 0) {
      return apiOk({ ok: true, concepts: [], students: [], classAverage: [] });
    }

    // 3. Mapping question_id → concept_id (questions avec concept_id NULL filtrées)
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

    // 4. Concepts (name, slug) ordonnés alphabétiquement
    const { data: conceptsData } = await admin
      .from("concepts")
      .select("id, name, slug")
      .in("id", Array.from(conceptIdSet))
      .order("name", { ascending: true });
    const concepts =
      (conceptsData as { id: string; name: string; slug: string }[] | null) ?? [];
    const conceptIdToIndex = new Map(concepts.map((c, i) => [c.id, i]));

    // 5. Élèves de la classe (status='active')
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

    // 6. Profils élèves + status completions + answers — en parallèle (3 calls)
    const [profilesRes, completionsRes, answersRes] = await Promise.all([
      admin
        .from("user_profiles")
        .select("id, first_name, last_name, pseudo")
        .in("id", studentIds),
      admin
        .from("assignment_completions")
        .select("student_user_id, status")
        .eq("assignment_id", params.assignmentId)
        .in("student_user_id", studentIds),
      admin
        .from("assignment_question_answers")
        .select("student_user_id, question_id, is_correct")
        .eq("assignment_id", params.assignmentId)
        .in("student_user_id", studentIds),
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

    const statusMap = new Map<string, string>(
      ((completionsRes.data as { student_user_id: string; status: string }[] | null) ?? []).map(
        (c) => [c.student_user_id, c.status],
      ),
    );

    type AnswerRow = { student_user_id: string; question_id: string; is_correct: boolean };
    const answerRows = (answersRes.data as AnswerRow[] | null) ?? [];

    // 7. Agrégation (student × concept) → {correct, total}
    type Stats = { correct: number; total: number };
    const studentConcept = new Map<string, Map<string, Stats>>();
    for (const answer of answerRows) {
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

    // 8. Construire students[]
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
      const rawStatus = statusMap.get(studentId);
      const status: "completed" | "in_progress" | "not_started" =
        rawStatus === "completed"
          ? "completed"
          : rawStatus === "in_progress"
            ? "in_progress"
            : "not_started";
      return { user_id: studentId, display_name: display, status, masteries };
    });

    // 9. Class average par concept (sommation across élèves)
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
    return safeError(err, "assignment-heatmap-data", "Erreur lors du chargement de la heatmap");
  }
}
