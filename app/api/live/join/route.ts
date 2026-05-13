import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase-server";
import { requireSchoolMembership } from "@/lib/tenant";
import { logError } from "@/lib/observability/log-error";

export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z0-9]{6}$/i;

function admin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/live/join  body: { code }  → student joins
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const supabase = createClient();
    const schoolId = await requireSchoolMembership(supabase);

    const body = (await req.json()) as { code?: unknown };
    if (typeof body.code !== "string" || !CODE_RE.test(body.code)) {
      return apiError("Code invalide", 400);
    }
    const code = body.code.toUpperCase();

    const a = admin();
    const { data: session, error: sErr } = await a
      .from("live_sessions")
      .select("id, school_id, ended_at, phase")
      .eq("code", code)
      .maybeSingle();

    if (sErr || !session) {
      return apiError("Session introuvable", 404);
    }
    if ((session as { school_id: string }).school_id !== schoolId) {
      return apiError("Cette session n'appartient pas à votre école", 403);
    }
    if ((session as { ended_at: string | null }).ended_at !== null) {
      return apiError("Cette session est terminée", 410);
    }

    const displayName =
      (auth.user.user_metadata?.full_name as string | undefined)?.slice(0, 80) ??
      (auth.user.user_metadata?.name as string | undefined)?.slice(0, 80) ??
      (auth.user.email ?? "Anonyme").slice(0, 80);

    const { error: pErr } = await a
      .from("live_session_participants")
      .upsert(
        {
          session_id: (session as { id: string }).id,
          student_user_id: auth.user.id,
          display_name: displayName,
        },
        { onConflict: "session_id,student_user_id" },
      );

    if (pErr) {
      await logError(pErr, {
        source: "api.live.join.POST",
        context: { code, userId: auth.user.id },
        userId: auth.user.id,
        schoolId,
      });
      return apiError("Inscription à la session échouée", 500);
    }

    return apiOk({ session_id: (session as { id: string }).id, phase: (session as { phase: string }).phase });
  } catch (err) {
    await logError(err, { source: "api.live.join.POST" });
    return safeError(err, "live:join");
  }
}
