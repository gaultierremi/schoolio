import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";
import { isValidUuid, nextOrdinal, validateMisconceptionPostBody } from "@/lib/curation/validation";

export const runtime = "nodejs";

/**
 * POST /api/curation/concept/[id]/misconceptions
 *
 * Sprint 2B — Crée une nouvelle misconception attachée à un concept.
 *
 * Body : { label: string } (1-300 chars, voir CHECK migration)
 *
 * Auto-ordinal : MAX(ordinal)+1 du concept (max 10 par CHECK, sinon 409).
 * Auth : prof connecté, tenant du concept (RLS double-check).
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (!isValidUuid(params.id)) {
    return apiError("ID concept invalide", 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError("Body JSON invalide", 400);
  }

  const validation = validateMisconceptionPostBody(rawBody);
  if (!validation.ok) return apiError(validation.error, validation.status);
  const { label } = validation;

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: profile } = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    const schoolId = (profile as { school_id?: string } | null)?.school_id;
    if (!schoolId) return apiError("Profil utilisateur incomplet", 403);

    const { data: concept } = await admin
      .from("concepts")
      .select("id, school_id")
      .eq("id", params.id)
      .maybeSingle();
    if (!concept) return apiError("Concept introuvable", 404);
    if ((concept as { school_id: string }).school_id !== schoolId) {
      return apiError("Accès refusé", 403);
    }

    // Auto-ordinal
    const { data: maxRow } = await admin
      .from("concept_misconceptions")
      .select("ordinal")
      .eq("concept_id", params.id)
      .order("ordinal", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrd = nextOrdinal((maxRow as { ordinal?: number } | null)?.ordinal, 10);
    if (nextOrd === null) {
      return apiError("10 misconceptions max par concept", 409);
    }

    const { data: inserted, error: insErr } = await admin
      .from("concept_misconceptions")
      .insert({
        concept_id: params.id,
        school_id: schoolId,
        label,
        ordinal: nextOrd,
      })
      .select("id, label, ordinal, created_at, updated_at")
      .single();
    if (insErr || !inserted) throw insErr ?? new Error("insert failed");

    const insertedRow = inserted as {
      id: string;
      label: string;
      ordinal: number;
      created_at: string;
      updated_at: string;
    };

    await logAuditEvent({
      actorId: user.id,
      actorEmail: user.email ?? null,
      actorRole: "teacher",
      eventType: AUDIT_EVENTS.CONCEPT_MISCONCEPTION_CREATED,
      targetType: "concept_misconception",
      targetId: insertedRow.id,
      details: { concept_id: params.id, label: insertedRow.label, ordinal: insertedRow.ordinal },
    });

    return apiOk({ ok: true, misconception: insertedRow }, 201);
  } catch (err) {
    return safeError(err, "curation-misconceptions-create", "Erreur lors de la création");
  }
}
