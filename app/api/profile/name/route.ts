import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { logError } from "@/lib/observability/log-error";

export const dynamic = "force-dynamic";

function admin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/profile/name  body: { first_name, last_name }
// Set côté onboarding première connexion. user_profiles.first_name/last_name
// passent de NULL à valeurs renseignées par l'utilisateur.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as { first_name?: unknown; last_name?: unknown };

    if (typeof body.first_name !== "string" || body.first_name.trim().length < 1 || body.first_name.length > 80) {
      return apiError("Prénom requis (1-80 caractères)", 400);
    }
    if (typeof body.last_name !== "string" || body.last_name.trim().length < 1 || body.last_name.length > 80) {
      return apiError("Nom requis (1-80 caractères)", 400);
    }

    const firstName = body.first_name.trim().slice(0, 80);
    const lastName = body.last_name.trim().slice(0, 80);
    const fullName = `${firstName} ${lastName}`;

    const a = admin();
    const { error } = await a
      .from("user_profiles")
      .update({ first_name: firstName, last_name: lastName, user_name: fullName })
      .eq("id", auth.user.id);

    if (error) {
      await logError(error, { source: "api.profile.name.POST", userId: auth.user.id });
      return apiError("Mise à jour du profil échouée", 500);
    }

    return apiOk({ first_name: firstName, last_name: lastName });
  } catch (err) {
    await logError(err, { source: "api.profile.name.POST" });
    return safeError(err, "profile:name");
  }
}
