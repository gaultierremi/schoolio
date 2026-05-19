import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { isValidUuid } from "@/lib/curation/validation";
import {
  computeMasteryPct,
  groupQuestionsByConcept,
  latestAnswerByQuestion,
} from "@/lib/assignment-student-detail";

export const runtime = "nodejs";

/**
 * GET /api/classes/[id]/assignments/[assignmentId]/student/[studentId]
 *
 * Sprint 5 PR S5-1 — Drill-down détail élève × devoir (depuis heatmap classe).
 *
 * Retourne les réponses détaillées de l'élève sur le devoir, groupées par
 * concept (cohérent avec l'axe concepts de la heatmap). Permet au prof de
 * voir exactement où l'élève a buté.
 *
 * Auth :
 * - requireTeacher
 * - Le prof doit posséder la classe
 * - Le devoir doit être lié à la classe
 * - L'élève doit être membre actif de la classe
 *
 * Pattern reproduit du heatmap-data endpoint (auth + tenant check + Promise.all
 * agrégation O(M) en mémoire). Lecture seule, jamais de DELETE (règle CLAUDE.md
 * #23 never-DELETE événementiel respectée).
 *
 * Response shape :
 * {
 *   ok: true,
 *   student: { user_id, display_name, status, membership_status },
 *   assignment: { id, title },
 *   byConcept: [
 *     {
 *       concept: { id, name, slug },
 *       masteryPct: number,         // 0-100, 0 si non évalué
 *       questions: [
 *         {
 *           id, question, type, difficulty_stars, position,
 *           answer: { is_correct, requested_solution, requested_explanation, created_at } | null
 *         }
 *       ]
 *     }
 *   ],
 *   questionsWithoutConcept: [...]   // questions du devoir sans concept_id (rare)
 * }
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string; assignmentId: string; studentId: string } },
) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const teacher = auth.user;

  if (
    !isValidUuid(params.id) ||
    !isValidUuid(params.assignmentId) ||
    !isValidUuid(params.studentId)
  ) {
    return apiError("ID invalide", 400);
  }

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1. Vérifier ownership classe + devoir lié + élève membre
    // Note : on throw sur .error pour basculer sur safeError (sinon faux 200
    // avec data vide masque les régressions schema/RLS — hard review B2).
    const [classRes, assignmentRes, membershipRes] = await Promise.all([
      admin.from("classes").select("id, teacher_id").eq("id", params.id).maybeSingle(),
      admin
        .from("assignments")
        .select("id, class_id, title")
        .eq("id", params.assignmentId)
        .maybeSingle(),
      admin
        .from("class_memberships")
        .select("student_user_id, status")
        .eq("class_id", params.id)
        .eq("student_user_id", params.studentId)
        .maybeSingle(),
    ]);
    if (classRes.error) throw classRes.error;
    if (assignmentRes.error) throw assignmentRes.error;
    if (membershipRes.error) throw membershipRes.error;

    const classRow = classRes.data as { id: string; teacher_id: string } | null;
    const assignmentRow = assignmentRes.data as
      | { id: string; class_id: string; title: string }
      | null;
    const membershipRow = membershipRes.data as
      | { student_user_id: string; status: string }
      | null;

    if (!classRow) return apiError("Classe introuvable", 404);
    if (classRow.teacher_id !== teacher.id) {
      return apiError("Accès refusé : cette classe n'est pas à vous", 403);
    }
    if (!assignmentRow) return apiError("Devoir introuvable", 404);
    if (assignmentRow.class_id !== params.id) {
      return apiError("Devoir non lié à cette classe", 404);
    }
    if (!membershipRow) return apiError("Élève non membre de cette classe", 404);
    // Note : on tolère status != "active" (ex: "removed") pour permettre la
    // consultation historique. Mémoire `tables_legacy_audit_later` + règle
    // CLAUDE.md #23 (never-DELETE) : les stats restent visibles même si élève
    // a quitté la classe.

    // 2. Questions du devoir (avec position pour ordering) + détails questions
    const aqRes = await admin
      .from("assignment_questions")
      .select("question_id, position")
      .eq("assignment_id", params.assignmentId)
      .order("position", { ascending: true });
    if (aqRes.error) throw aqRes.error;

    type AQ = { question_id: string; position: number };
    const assignmentQuestions = (aqRes.data as AQ[] | null) ?? [];
    const questionIds = assignmentQuestions.map((q) => q.question_id);
    const questionIdToPosition = new Map(assignmentQuestions.map((q) => [q.question_id, q.position]));

    if (questionIds.length === 0) {
      return apiOk({
        ok: true,
        student: {
          user_id: params.studentId,
          display_name: "Élève",
          status: "not_started",
          membership_status: membershipRow.status,
        },
        assignment: { id: assignmentRow.id, title: assignmentRow.title },
        byConcept: [],
        questionsWithoutConcept: [],
      });
    }

    // 3. Détails questions + profile élève + completion status + réponses (parallèle)
    const [questionsRes, profileRes, completionRes, answersRes] = await Promise.all([
      admin
        .from("teacher_questions")
        .select("id, question, type, difficulty_stars, concept_id")
        .in("id", questionIds),
      admin
        .from("user_profiles")
        .select("id, first_name, last_name, pseudo")
        .eq("id", params.studentId)
        .maybeSingle(),
      admin
        .from("assignment_completions")
        .select("status")
        .eq("assignment_id", params.assignmentId)
        .eq("student_user_id", params.studentId)
        .maybeSingle(),
      admin
        .from("assignment_question_answers")
        .select(
          "question_id, is_correct, requested_solution, requested_explanation, created_at",
        )
        .eq("assignment_id", params.assignmentId)
        .eq("student_user_id", params.studentId),
    ]);
    if (questionsRes.error) throw questionsRes.error;
    if (profileRes.error) throw profileRes.error;
    if (completionRes.error) throw completionRes.error;
    if (answersRes.error) throw answersRes.error;

    type QuestionRow = {
      id: string;
      question: string;
      type: string;
      difficulty_stars: 1 | 2 | 3 | null;
      concept_id: string | null;
    };
    const questions = (questionsRes.data as QuestionRow[] | null) ?? [];

    type Profile = {
      id: string;
      first_name: string | null;
      last_name: string | null;
      pseudo: string | null;
    };
    const profile = profileRes.data as Profile | null;
    const displayName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
      profile?.pseudo ||
      "Élève";

    const rawStatus = (completionRes.data as { status: string } | null)?.status;
    const status: "completed" | "in_progress" | "not_started" =
      rawStatus === "completed"
        ? "completed"
        : rawStatus === "in_progress"
          ? "in_progress"
          : "not_started";

    type AnswerRow = {
      question_id: string;
      is_correct: boolean;
      requested_solution: boolean;
      requested_explanation: boolean;
      created_at: string;
    };
    const answers = (answersRes.data as AnswerRow[] | null) ?? [];
    // Pour une question donnée, on prend la dernière réponse (par created_at).
    // Cas edge : retry — on ne veut pas mélanger les indices/solution view.
    // Logique extraite en `lib/assignment-student-detail.ts` pour testabilité.
    const answerByQuestion = latestAnswerByQuestion(answers);

    // 4. Récupérer concepts pour mapping id → {name, slug}
    const conceptIds = Array.from(
      new Set(questions.map((q) => q.concept_id).filter((id): id is string => id !== null)),
    );
    let concepts: { id: string; name: string; slug: string }[] = [];
    if (conceptIds.length > 0) {
      const conceptsRes = await admin
        .from("concepts")
        .select("id, name, slug")
        .in("id", conceptIds)
        .order("name", { ascending: true });
      if (conceptsRes.error) throw conceptsRes.error;
      concepts =
        (conceptsRes.data as { id: string; name: string; slug: string }[] | null) ?? [];
    }

    // 5. Grouper questions par concept_id, ordonner par position dans le devoir
    type EnrichedQuestion = {
      id: string;
      question: string;
      type: string;
      difficulty_stars: 1 | 2 | 3 | null;
      position: number;
      answer: {
        is_correct: boolean;
        requested_solution: boolean;
        requested_explanation: boolean;
        created_at: string;
      } | null;
    };

    function enrichQuestion(q: QuestionRow): EnrichedQuestion {
      const answer = answerByQuestion.get(q.id) ?? null;
      return {
        id: q.id,
        question: q.question,
        type: q.type,
        difficulty_stars: q.difficulty_stars,
        position: questionIdToPosition.get(q.id) ?? 0,
        answer: answer
          ? {
              is_correct: answer.is_correct,
              requested_solution: answer.requested_solution,
              requested_explanation: answer.requested_explanation,
              created_at: answer.created_at,
            }
          : null,
      };
    }

    // Enrichir + grouper par concept via helpers purs testables
    const enrichedAll = questions.map((q) => ({
      ...enrichQuestion(q),
      concept_id: q.concept_id,
    }));
    const { byConceptId, orphans } = groupQuestionsByConcept(enrichedAll);

    const byConcept = concepts.map((c) => {
      const conceptQuestions = (byConceptId.get(c.id) ?? []).map(({ concept_id: _c, ...rest }) => rest);
      const answered = conceptQuestions
        .filter((q) => q.answer !== null)
        .map((q) => ({ is_correct: q.answer!.is_correct }));
      const masteryPct = computeMasteryPct(answered);
      return { concept: c, masteryPct, questions: conceptQuestions };
    });

    const questionsWithoutConcept = orphans.map(
      ({ concept_id: _c, ...rest }) => rest,
    );

    return apiOk({
      ok: true,
      student: {
        user_id: params.studentId,
        display_name: displayName,
        status,
        membership_status: membershipRow.status,
      },
      assignment: { id: assignmentRow.id, title: assignmentRow.title },
      byConcept,
      questionsWithoutConcept,
    });
  } catch (err) {
    return safeError(
      err,
      "assignment-student-detail",
      "Erreur lors du chargement du détail élève",
    );
  }
}
