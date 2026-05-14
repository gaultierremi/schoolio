/**
 * POST /api/student/check-answer
 *
 * Server-side grading endpoint — anti-cheat layer.
 * Answers are never evaluated client-side for correctness;
 * all truth comes through here.
 *
 * Auth: requireUser (authenticated student, NOT teacher-only).
 * Tenant isolation: question must belong to the same school_id as the student.
 */

import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { checkAnswer, type GradableQuestion } from "@/lib/grading/check-answer";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type TeacherQuestionRow = {
  id: string;
  school_id: string | null;
  type: string;
  answer_index: number | null;
  expected_numeric_answer: number | null;
  numeric_tolerance: number | null;
  expected_text_answers: string[] | null;
};

type UserProfileRow = {
  school_id: string | null;
};

export async function POST(req: NextRequest) {
  // 1. Auth check — first instruction, no exception (rule 4).
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    // 2. Parse + validate body (rule 7).
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Corps de requête JSON invalide", 400);
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return apiError("Corps de requête invalide", 400);
    }

    const { question_id, student_answer } = body as Record<string, unknown>;

    // question_id: must be a valid UUID string.
    if (typeof question_id !== "string" || !UUID_RE.test(question_id)) {
      return apiError("'question_id' doit être un UUID valide", 400);
    }

    // student_answer: must be present (0 and "" are valid).
    if (student_answer === undefined || student_answer === null) {
      return apiError("'student_answer' est requis", 400);
    }
    if (
      typeof student_answer !== "string" &&
      typeof student_answer !== "number"
    ) {
      return apiError("'student_answer' doit être une string ou un number", 400);
    }
    if (typeof student_answer === "string" && student_answer.length > 500) {
      return apiError("'student_answer' dépasse 500 caractères", 400);
    }
    if (typeof student_answer === "number" && !Number.isFinite(student_answer)) {
      return apiError("'student_answer' doit être un nombre fini", 400);
    }

    const admin = createAdminClient();

    // 3. Fetch question.
    const { data: questionData, error: questionError } = await admin
      .from("teacher_questions")
      .select(
        "id, school_id, type, answer_index, expected_numeric_answer, numeric_tolerance, expected_text_answers",
      )
      .eq("id", question_id)
      .maybeSingle<TeacherQuestionRow>();

    if (questionError) {
      return safeError(questionError, "check-answer:fetchQuestion");
    }
    if (!questionData) {
      return apiError("Question introuvable", 404);
    }

    // 4. Tenant isolation: question.school_id must match student's school_id.
    const { data: profileData, error: profileError } = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", auth.user.id)
      .maybeSingle<UserProfileRow>();

    if (profileError) {
      return safeError(profileError, "check-answer:fetchProfile");
    }

    if (
      !questionData.school_id ||
      !profileData?.school_id ||
      questionData.school_id !== profileData.school_id
    ) {
      return apiError("Accès interdit", 403);
    }

    // 5. Grade server-side using pure function.
    const gradable: GradableQuestion = {
      type: questionData.type as GradableQuestion["type"],
      answer_index: questionData.answer_index,
      expected_numeric_answer: questionData.expected_numeric_answer,
      numeric_tolerance: questionData.numeric_tolerance,
      expected_text_answers: questionData.expected_text_answers,
    };
    const result = checkAnswer(gradable, student_answer as string | number);

    // Anti-leak: we only return is_correct in this MVP (no expected_display).
    return apiOk({ is_correct: result.is_correct });
  } catch (err) {
    return safeError(err, "check-answer:POST");
  }
}
