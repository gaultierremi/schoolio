import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { pickRandom } from "@/lib/live/codes";
import { logError } from "@/lib/observability/log-error";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const VALID_ACTIONS = ["start_question", "reveal", "pick_random", "next_question", "end"] as const;
type HostAction = typeof VALID_ACTIONS[number];

function admin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/live/[id]/host  body: { action: 'start_question'|'reveal'|'pick_random'|'next_question'|'end' }
//
// Unified host control endpoint — pilote le state machine de la session.
// Single endpoint = moins de boilerplate auth/validation que 5 routes séparées.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireTeacher();
    if (!auth.ok) return auth.response;

    if (!UUID_RE.test(params.id)) return apiError("session id invalide", 400);

    const body = (await req.json()) as { action?: unknown };
    if (typeof body.action !== "string" || !(VALID_ACTIONS as readonly string[]).includes(body.action)) {
      return apiError("action invalide", 400);
    }
    const action = body.action as HostAction;

    const a = admin();
    const { data: session, error: sErr } = await a
      .from("live_sessions")
      .select("id, teacher_id, phase, current_index, question_ids, ended_at")
      .eq("id", params.id)
      .maybeSingle();
    if (sErr || !session) return apiError("Session introuvable", 404);

    const s = session as {
      id: string;
      teacher_id: string;
      phase: string;
      current_index: number;
      question_ids: string[];
      ended_at: string | null;
    };
    if (s.teacher_id !== auth.user.id) return apiError("Accès refusé", 403);
    if (s.ended_at) return apiError("Session terminée", 410);

    const patch: Record<string, unknown> = {};

    switch (action) {
      case "start_question":
        // lobby → answering (or revealed/picked → answering pour aller à la suivante via next_question)
        if (s.phase !== "lobby") return apiError("La session a déjà démarré", 409);
        patch.phase = "answering";
        patch.picked_student_id = null;
        break;

      case "reveal":
        if (s.phase !== "answering") return apiError("Pas en phase de réponse", 409);
        patch.phase = "revealed";
        break;

      case "pick_random": {
        if (s.phase !== "revealed" && s.phase !== "answering") {
          return apiError("Tirage possible seulement après les réponses", 409);
        }
        const questionId = s.question_ids[s.current_index];
        if (!questionId) return apiError("Aucune question courante", 400);

        // Tirage parmi les élèves ayant répondu à la question courante.
        const { data: answers, error: aErr } = await a
          .from("live_session_answers")
          .select("student_user_id")
          .eq("session_id", s.id)
          .eq("question_id", questionId);
        if (aErr) throw aErr;
        const candidates = ((answers ?? []) as { student_user_id: string }[]).map((r) => r.student_user_id);
        if (candidates.length === 0) return apiError("Personne n'a encore répondu", 409);

        const picked = pickRandom(candidates);
        patch.picked_student_id = picked;
        patch.phase = "picked";
        break;
      }

      case "next_question": {
        if (s.phase === "ended") return apiError("Session terminée", 410);
        const nextIndex = s.current_index + 1;
        if (nextIndex >= s.question_ids.length) {
          patch.phase = "ended";
          patch.ended_at = new Date().toISOString();
        } else {
          patch.current_index = nextIndex;
          patch.phase = "answering";
          patch.picked_student_id = null;
        }
        break;
      }

      case "end":
        patch.phase = "ended";
        patch.ended_at = new Date().toISOString();
        break;
    }

    const { data: updated, error: uErr } = await a
      .from("live_sessions")
      .update(patch)
      .eq("id", s.id)
      .select("id, phase, current_index, picked_student_id, ended_at")
      .single();

    if (uErr || !updated) {
      await logError(uErr, {
        source: "api.live.host.POST",
        context: { sessionId: s.id, action },
        userId: auth.user.id,
      });
      return apiError("Mise à jour échouée", 500);
    }

    return apiOk({ session: updated });
  } catch (err) {
    await logError(err, { source: "api.live.host.POST" });
    return safeError(err, "live:host");
  }
}
