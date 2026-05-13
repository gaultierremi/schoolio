import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase-server";
import { requireSchoolMembership } from "@/lib/tenant";
import { logError } from "@/lib/observability/log-error";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function admin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/live/[id]/answer  body: { answer_index }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const supabase = createClient();
    const schoolId = await requireSchoolMembership(supabase);

    if (!UUID_RE.test(params.id)) return apiError("session id invalide", 400);

    const body = (await req.json()) as { answer_index?: unknown };
    if (typeof body.answer_index !== "number" || !Number.isInteger(body.answer_index) || body.answer_index < 0 || body.answer_index > 20) {
      return apiError("answer_index invalide", 400);
    }

    const a = admin();
    const { data: session, error: sErr } = await a
      .from("live_sessions")
      .select("id, school_id, phase, current_index, question_ids")
      .eq("id", params.id)
      .maybeSingle();
    if (sErr || !session) return apiError("Session introuvable", 404);

    const s = session as {
      id: string;
      school_id: string;
      phase: string;
      current_index: number;
      question_ids: string[];
    };
    if (s.school_id !== schoolId) return apiError("Accès refusé", 403);
    if (s.phase !== "answering") return apiError("La session n'attend pas de réponse", 409);

    const questionId = s.question_ids[s.current_index];
    if (!questionId) return apiError("Aucune question courante", 400);

    // Fetch the question to validate answer_index range + compute is_correct.
    const { data: q, error: qErr } = await a
      .from("teacher_questions")
      .select("id, options, answer_index")
      .eq("id", questionId)
      .maybeSingle();
    if (qErr || !q) return apiError("Question introuvable", 404);
    const opts = (q as { options: string[] }).options ?? [];
    if (body.answer_index >= opts.length) return apiError("answer_index hors plage", 400);

    const isCorrect = body.answer_index === (q as { answer_index: number }).answer_index;

    const { error: insErr } = await a
      .from("live_session_answers")
      .upsert(
        {
          session_id: s.id,
          question_id: questionId,
          student_user_id: auth.user.id,
          answer_index: body.answer_index,
          is_correct: isCorrect,
        },
        { onConflict: "session_id,question_id,student_user_id" },
      );

    if (insErr) {
      await logError(insErr, {
        source: "api.live.answer.POST",
        context: { sessionId: s.id, questionId, userId: auth.user.id },
        userId: auth.user.id,
        schoolId,
      });
      return apiError("Enregistrement de la réponse échoué", 500);
    }

    return apiOk({ recorded: true });
  } catch (err) {
    await logError(err, { source: "api.live.answer.POST" });
    return safeError(err, "live:answer");
  }
}
