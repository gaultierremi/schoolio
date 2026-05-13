// Sprint 0.5 — minimal identity update for /profile page.
// Only identity fields (first_name, last_name, avatar_color) are accepted.
// Skin / gamification fields were dropped per spec §2.2.

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

// Hex-color pattern — 3 or 6 hex digits.
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Simple name pattern: letters (including accented), spaces, hyphens, apostrophes.
const NAME_RE = /^[\p{L}\p{M}\s'\-]+$/u;

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function PATCH(req: Request) {
  // Rule 4: auth check first.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Corps JSON invalide", 400);
  }

  if (typeof body !== "object" || body === null) {
    return apiError("Corps JSON invalide", 400);
  }

  const raw = body as Record<string, unknown>;
  const updates: { first_name?: string; last_name?: string; avatar_color?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  // Rule 7: strict validation on every field.

  if ("first_name" in raw) {
    const v = raw.first_name;
    if (typeof v !== "string" || v.trim().length === 0 || v.length > 100) {
      return apiError("first_name : chaîne de 1 à 100 caractères requise", 400);
    }
    if (!NAME_RE.test(v.trim())) {
      return apiError("first_name : caractères invalides", 400);
    }
    updates.first_name = v.trim();
  }

  if ("last_name" in raw) {
    const v = raw.last_name;
    if (typeof v !== "string" || v.trim().length === 0 || v.length > 100) {
      return apiError("last_name : chaîne de 1 à 100 caractères requise", 400);
    }
    if (!NAME_RE.test(v.trim())) {
      return apiError("last_name : caractères invalides", 400);
    }
    updates.last_name = v.trim();
  }

  if ("avatar_color" in raw) {
    const v = raw.avatar_color;
    if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
      return apiError("avatar_color : couleur hex invalide (ex: #f59e0b)", 400);
    }
    updates.avatar_color = v;
  }

  // Nothing to update (only updated_at present).
  if (Object.keys(updates).length === 1) {
    return apiError("Aucun champ valide à mettre à jour", 400);
  }

  try {
    const { data, error } = await admin()
      .from("user_profiles")
      .update(updates)
      // Rule 5: always use auth.user.id, never body.user_id.
      .eq("id", auth.user.id)
      .select("id, first_name, last_name, avatar_color, updated_at")
      .maybeSingle();

    if (error) {
      return safeError(error, "profile/update", "Erreur lors de la mise à jour du profil", 500);
    }

    if (!data) {
      return apiError("Profil introuvable", 404);
    }

    return apiOk({ profile: data });
  } catch (err) {
    return safeError(err, "profile/update");
  }
}
