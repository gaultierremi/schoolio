import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiOk, apiError, safeError } from "@/lib/api/respond";
import { ADMIN_EMAILS } from "@/lib/admin-config";
import type {
  BetaFeedbackPayload,
  BetaFeedbackInputMethod,
  BetaFeedbackSuggestedType,
} from "@/types/beta-feedback";

export const dynamic = "force-dynamic";

const VALID_INPUT_METHODS: BetaFeedbackInputMethod[] = ["voice", "text", "mixed"];
const VALID_SUGGESTED_TYPES: BetaFeedbackSuggestedType[] = ["bug", "feature_request", "general"];

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const admin = createAdminClient();

    // Check beta_tester flag OR admin email
    const { data: profile } = await admin
      .from("user_profiles")
      .select("beta_tester")
      .eq("id", auth.user.id)
      .maybeSingle<{ beta_tester: boolean }>();

    const isBetaTester = profile?.beta_tester === true;
    const isAdmin = (ADMIN_EMAILS as readonly string[]).includes(auth.email);

    if (!isBetaTester && !isAdmin) {
      return apiError("Accès réservé aux beta testeurs", 403);
    }

    const body = (await req.json()) as Record<string, unknown>;

    // ── Validation ──────────────────────────────────────────────────────────

    if (typeof body.transcript !== "string" || body.transcript.trim().length === 0) {
      return apiError("'transcript' (string non vide) est requis", 400);
    }
    if (body.transcript.length > 10_000) {
      return apiError("'transcript' dépasse 10 000 caractères", 400);
    }

    if (!VALID_INPUT_METHODS.includes(body.input_method as BetaFeedbackInputMethod)) {
      return apiError(
        `'input_method' invalide — valeurs : ${VALID_INPUT_METHODS.join(", ")}`,
        400,
      );
    }

    if (body.suggested_type !== undefined && body.suggested_type !== null) {
      if (!VALID_SUGGESTED_TYPES.includes(body.suggested_type as BetaFeedbackSuggestedType)) {
        return apiError(
          `'suggested_type' invalide — valeurs : ${VALID_SUGGESTED_TYPES.join(", ")}`,
          400,
        );
      }
    }

    for (const field of ["page_url", "page_title", "user_agent", "viewport"] as const) {
      if (body[field] !== undefined && body[field] !== null) {
        if (typeof body[field] !== "string" || (body[field] as string).length > 2_000) {
          return apiError(`'${field}' doit être une string ≤ 2000 caractères`, 400);
        }
      }
    }

    if (body.duration_sec !== undefined && body.duration_sec !== null) {
      if (
        typeof body.duration_sec !== "number" ||
        body.duration_sec < 0 ||
        !Number.isInteger(body.duration_sec)
      ) {
        return apiError("'duration_sec' doit être un entier ≥ 0", 400);
      }
    }

    // ── Insert ───────────────────────────────────────────────────────────────

    const payload = body as unknown as BetaFeedbackPayload;

    const { data: inserted, error } = await admin
      .from("beta_feedback")
      .insert({
        user_id: auth.user.id,
        user_email_snapshot: auth.email,
        transcript: payload.transcript.trim(),
        input_method: payload.input_method,
        suggested_type: payload.suggested_type ?? null,
        page_url: payload.page_url ?? null,
        page_title: payload.page_title ?? null,
        user_agent: payload.user_agent ?? null,
        viewport: payload.viewport ?? null,
        duration_sec: payload.duration_sec ?? null,
      })
      .select("id, status")
      .single();

    if (error) throw error;

    return apiOk({ id: inserted.id, status: inserted.status }, 201);
  } catch (err) {
    return safeError(err, "beta-feedback:POST");
  }
}
