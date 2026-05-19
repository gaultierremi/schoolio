/**
 * POST /api/student/hint-feedback
 *
 * Sprint 6 PR S6-7 — Persiste l'évaluation 👍/👎 d'un indice tuteur par l'élève.
 *
 * Body : { hint_id (UUID), evaluation ("up" | "down") }
 *
 * UPSERT sur (user_id, hint_id) : l'élève peut changer d'avis.
 *
 * Auth : requireUser.
 * Tenant : hint.school_id == profile.school_id.
 */

import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { isValidUuid } from "@/lib/curation/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const { hint_id, evaluation } = body as Record<string, unknown>;

    if (!isValidUuid(hint_id)) {
      return apiError("'hint_id' doit être un UUID valide", 400);
    }
    if (evaluation !== "up" && evaluation !== "down") {
      return apiError("'evaluation' doit être 'up' ou 'down'", 400);
    }

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Tenant check via hint.school_id + question_id pour vérifier que
    // l'élève a effectivement vu cette question (hot-fix D5 anti-pollution
    // analytics : sinon élève peut spam-feedback toute hint de son tenant
    // même hors devoirs assignés).
    const hintRes = await admin
      .from("question_hints")
      .select("id, school_id, question_id")
      .eq("id", hint_id)
      .maybeSingle();
    if (hintRes.error) throw hintRes.error;
    const hint = hintRes.data as
      | { id: string; school_id: string; question_id: string }
      | null;
    if (!hint) return apiError("Indice introuvable", 404);

    const profileRes = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileRes.error) throw profileRes.error;
    const schoolId = (profileRes.data as { school_id?: string } | null)?.school_id;
    if (!schoolId || schoolId !== hint.school_id) {
      return apiError("Accès interdit", 403);
    }

    // D5 hot-fix : vérifier que l'élève a effectivement vu/répondu à cette
    // question (sinon il peut spam-feedback toute hint de son tenant).
    const seenRes = await admin
      .from("assignment_question_answers")
      .select("id")
      .eq("student_user_id", user.id)
      .eq("question_id", hint.question_id)
      .limit(1)
      .maybeSingle();
    if (seenRes.error) throw seenRes.error;
    if (!seenRes.data) {
      return apiError(
        "Tu ne peux évaluer un indice que sur une question que tu as déjà tentée",
        403,
      );
    }

    // UPSERT (user_id, hint_id) → permet de changer d'avis
    const upsertRes = await admin
      .from("hint_evaluations")
      .upsert(
        {
          user_id: user.id,
          hint_id: hint.id,
          school_id: schoolId,
          evaluation,
        },
        { onConflict: "user_id,hint_id" },
      )
      .select("id, evaluation, updated_at")
      .single();
    if (upsertRes.error) throw upsertRes.error;

    return apiOk({ ok: true, evaluation });
  } catch (err) {
    return safeError(err, "hint-feedback:POST");
  }
}
