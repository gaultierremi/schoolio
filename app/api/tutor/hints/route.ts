import { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase-server";
import { renderHints, type HintRow } from "@/lib/tutor/render-hints";
import { logError } from "@/lib/observability/log-error";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const MAX_WRONG_ANSWER_CHARS = 500;

// ── GET /api/tutor/hints?question_id=...&wrong_answer=... ────────────────────
// Retourne les hints PRÉ-BAKED approuvés d'une question, slots remplis avec
// la réponse fausse de l'élève. 0-IA-runtime — pas d'appel Claude ici.
// RLS scope au tenant + filtre approved_at NOT NULL pour les élèves.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const questionId = req.nextUrl.searchParams.get("question_id");
    if (typeof questionId !== "string" || !UUID_RE.test(questionId)) {
      return apiError("question_id invalide", 400);
    }

    const wrongAnswerRaw = req.nextUrl.searchParams.get("wrong_answer") ?? "";
    if (wrongAnswerRaw.length > MAX_WRONG_ANSWER_CHARS) {
      return apiError("wrong_answer trop long", 400);
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("question_hints")
      .select("id, question_id, ordinal, template, kind")
      .eq("question_id", questionId)
      .not("approved_at", "is", null)
      .order("ordinal", { ascending: true })
      .limit(10);

    if (error) {
      await logError(error, {
        source: "api.tutor.hints.GET",
        context: { questionId },
        userId: auth.user.id,
      });
      return apiError("Lecture des hints échouée", 500);
    }

    const rows = (data ?? []) as HintRow[];
    const rendered = renderHints(rows, { wrongAnswer: wrongAnswerRaw });

    return apiOk({ hints: rendered });
  } catch (err) {
    await logError(err, { source: "api.tutor.hints.GET" });
    return safeError(err, "tutor:hints:get");
  }
}
