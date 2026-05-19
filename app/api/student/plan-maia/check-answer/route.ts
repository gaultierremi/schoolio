/**
 * POST /api/student/plan-maia/check-answer
 *
 * Sprint 5 PR S5-4 — Grading + tracking d'une réponse Plan Maïa.
 *
 * Pattern : reproduit /api/student/check-answer (grading server-side anti-cheat)
 * + INSERT dans plan_maia_answers (tracking dédié, distinct de
 * assignment_question_answers).
 *
 * Le trigger DB `sync_plan_completed_count_from_plan_answers` (migration
 * 20260520) incrémente plan_maia_daily.completed_count automatiquement.
 *
 * Body : { plan_id, question_id, student_answer, requested_solution?, requested_explanation? }
 *
 * Auth : requireUser (élève authentifié, pas teacher).
 * Tenant : question.school_id == student.school_id (anti cross-tenant).
 * Ownership : plan.user_id == auth.user.id (élève ne peut écrire que sur son plan).
 *
 * Response : { is_correct: boolean }
 */

import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { checkAnswer, type GradableQuestion } from "@/lib/grading/check-answer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Corps de requête JSON invalide", 400);
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return apiError("Corps de requête invalide", 400);
    }

    const {
      plan_id,
      question_id,
      student_answer,
      requested_solution,
      requested_explanation,
    } = body as Record<string, unknown>;

    // Validation : règle CLAUDE.md #7 stricte
    if (typeof plan_id !== "string" || !UUID_RE.test(plan_id)) {
      return apiError("'plan_id' doit être un UUID valide", 400);
    }
    if (typeof question_id !== "string" || !UUID_RE.test(question_id)) {
      return apiError("'question_id' doit être un UUID valide", 400);
    }
    if (student_answer === undefined || student_answer === null) {
      return apiError("'student_answer' est requis", 400);
    }
    if (typeof student_answer !== "string" && typeof student_answer !== "number") {
      return apiError("'student_answer' doit être une string ou un number", 400);
    }
    if (typeof student_answer === "string" && student_answer.length > 500) {
      return apiError("'student_answer' dépasse 500 caractères", 400);
    }
    if (typeof student_answer === "number" && !Number.isFinite(student_answer)) {
      return apiError("'student_answer' doit être un nombre fini", 400);
    }
    // Booleans optionnels (l'élève a-t-il vu la solution / explication avant ?)
    const reqSolution =
      requested_solution === undefined ? false : Boolean(requested_solution);
    const reqExplanation =
      requested_explanation === undefined ? false : Boolean(requested_explanation);

    const admin = createAdminClient();

    // 1. Vérifie ownership plan + récupère plan_data.question_ids pour valider
    //    que la question fait bien partie de ce plan (anti-injection).
    const planRes = await admin
      .from("plan_maia_daily")
      .select("id, user_id, plan_data")
      .eq("id", plan_id)
      .maybeSingle();
    if (planRes.error) throw planRes.error;
    const plan = planRes.data as
      | { id: string; user_id: string; plan_data: { question_ids?: string[] } }
      | null;
    if (!plan) return apiError("Plan introuvable", 404);
    if (plan.user_id !== user.id) return apiError("Accès refusé sur ce plan", 403);

    const planQuestionIds = plan.plan_data.question_ids ?? [];
    if (!planQuestionIds.includes(question_id)) {
      return apiError("Cette question ne fait pas partie du plan", 400);
    }

    // 2. Fetch question + tenant check
    const questionRes = await admin
      .from("teacher_questions")
      .select(
        "id, school_id, type, answer_index, expected_numeric_answer, numeric_tolerance, expected_text_answers",
      )
      .eq("id", question_id)
      .maybeSingle();
    if (questionRes.error) throw questionRes.error;
    const question = questionRes.data as
      | {
          id: string;
          school_id: string | null;
          type: string;
          answer_index: number | null;
          expected_numeric_answer: number | null;
          numeric_tolerance: number | null;
          expected_text_answers: string[] | null;
        }
      | null;
    if (!question) return apiError("Question introuvable", 404);

    const profileRes = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileRes.error) throw profileRes.error;
    const profile = profileRes.data as { school_id: string | null } | null;
    if (
      !question.school_id ||
      !profile?.school_id ||
      question.school_id !== profile.school_id
    ) {
      return apiError("Accès interdit", 403);
    }

    // 3. Grade server-side (réutilise check-answer logic — anti-dette tech)
    const gradable: GradableQuestion = {
      type: question.type as GradableQuestion["type"],
      answer_index: question.answer_index,
      expected_numeric_answer: question.expected_numeric_answer,
      numeric_tolerance: question.numeric_tolerance,
      expected_text_answers: question.expected_text_answers,
    };
    const result = checkAnswer(gradable, student_answer as string | number);

    // 4. INSERT plan_maia_answers (trigger DB increment completed_count)
    const insertRes = await admin.from("plan_maia_answers").insert({
      plan_id: plan.id,
      question_id: question.id,
      user_id: user.id,
      school_id: profile.school_id,
      is_correct: result.is_correct,
      requested_solution: reqSolution,
      requested_explanation: reqExplanation,
      response_data: { answer: student_answer },
    });
    if (insertRes.error) throw insertRes.error;

    // Anti-leak : on retourne uniquement is_correct (cohérent /check-answer)
    return apiOk({ is_correct: result.is_correct });
  } catch (err) {
    return safeError(err, "plan-maia-check-answer:POST");
  }
}
