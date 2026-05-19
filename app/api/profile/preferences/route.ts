/**
 * POST /api/profile/preferences
 *
 * Sprint 6 PR S6-8 — Update préférences UX (actuellement : font dyslexique).
 *
 * Body : { prefers_dyslexic_font?: boolean }
 *
 * Auth : requireUser (n'importe quel rôle, l'élève comme le prof peut avoir
 * une pref dyslexique).
 *
 * Pas de tenant check (user_id = auth.uid via UPDATE filter).
 */

import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";

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
    const { prefers_dyslexic_font } = body as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    if (prefers_dyslexic_font !== undefined) {
      if (typeof prefers_dyslexic_font !== "boolean") {
        return apiError("'prefers_dyslexic_font' doit être boolean", 400);
      }
      patch.prefers_dyslexic_font = prefers_dyslexic_font;
    }

    if (Object.keys(patch).length === 0) {
      return apiError("Aucun champ à mettre à jour", 400);
    }

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const updateRes = await admin
      .from("user_profiles")
      .update(patch)
      .eq("id", user.id)
      .select("prefers_dyslexic_font")
      .single();
    if (updateRes.error) throw updateRes.error;

    return apiOk({ ok: true, prefers_dyslexic_font: (updateRes.data as { prefers_dyslexic_font: boolean }).prefers_dyslexic_font });
  } catch (err) {
    return safeError(err, "profile-preferences:POST");
  }
}
