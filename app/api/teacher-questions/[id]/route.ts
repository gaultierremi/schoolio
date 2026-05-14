import { type NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function isValidId(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * PATCH /api/teacher-questions/[id]
 * Body: { difficulty_stars: 1 | 2 | 3 | null }
 *
 * Allows the teacher to override the AI-suggested difficulty at any time,
 * independently from the validate/reject flow.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  // Rule 4: auth first
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  // Validate route param
  if (!isValidId(params.id)) {
    return apiError("Identifiant invalide", 400);
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Corps de requête invalide", 400);
  }

  if (!isRecord(body)) {
    return apiError("Corps de requête invalide", 400);
  }

  // Rule 7: validate difficulty_stars
  const { difficulty_stars } = body;
  if (
    difficulty_stars !== null &&
    difficulty_stars !== 1 &&
    difficulty_stars !== 2 &&
    difficulty_stars !== 3
  ) {
    return apiError("difficulty_stars doit être 1, 2, 3 ou null", 400);
  }

  try {
    const admin = createAdminClient();

    // Verify question ownership (cross-check teacher_id = user.id, not just RLS)
    const { data: existing, error: fetchErr } = await admin
      .from("teacher_questions")
      .select("id, teacher_id")
      .eq("id", params.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) return apiError("Question introuvable", 404);
    if ((existing as { teacher_id: string }).teacher_id !== auth.user.id) {
      return apiError("Accès refusé", 403);
    }

    const { data: updated, error: updateErr } = await admin
      .from("teacher_questions")
      .update({ difficulty_stars: difficulty_stars ?? null })
      .eq("id", params.id)
      .select("id, difficulty_stars")
      .single();

    if (updateErr) throw updateErr;

    return apiOk({ ok: true, difficulty_stars: (updated as { difficulty_stars: number | null }).difficulty_stars });
  } catch (err) {
    return safeError(err, "teacher-questions/[id] PATCH");
  }
}
