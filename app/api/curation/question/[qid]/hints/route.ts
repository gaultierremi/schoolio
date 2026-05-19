import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";
import { isValidUuid, validateHintPostBody } from "@/lib/curation/validation";

export const runtime = "nodejs";

/**
 * GET /api/curation/question/[qid]/hints
 *
 * Sprint 5 PR S5-2 — Liste les hints d'une question (vue prof : tous les
 * hints, incl. brouillons `approved_at IS NULL`).
 *
 * Auth : prof connecté, tenant de la question (RLS double-check explicite).
 */
export async function GET(
  _request: Request,
  { params }: { params: { qid: string } },
) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (!isValidUuid(params.qid)) {
    return apiError("ID question invalide", 400);
  }

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const profileRes = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileRes.error) throw profileRes.error;
    const schoolId = (profileRes.data as { school_id?: string } | null)?.school_id;
    if (!schoolId) return apiError("Profil utilisateur incomplet", 403);

    // Vérifie tenant de la question
    const questionRes = await admin
      .from("teacher_questions")
      .select("id, school_id")
      .eq("id", params.qid)
      .maybeSingle();
    if (questionRes.error) throw questionRes.error;
    const question = questionRes.data as { id: string; school_id: string } | null;
    if (!question) return apiError("Question introuvable", 404);
    if (question.school_id !== schoolId) return apiError("Accès refusé", 403);

    const hintsRes = await admin
      .from("question_hints")
      .select("id, ordinal, template, kind, misconception_id, approved_at, created_at, updated_at")
      .eq("question_id", params.qid)
      .order("ordinal", { ascending: true });
    if (hintsRes.error) throw hintsRes.error;

    return apiOk({ ok: true, hints: hintsRes.data ?? [] });
  } catch (err) {
    return safeError(err, "curation-hints-list", "Erreur lors du chargement des indices");
  }
}

/**
 * POST /api/curation/question/[qid]/hints
 *
 * Sprint 5 PR S5-2 — Crée un nouveau hint pour une question.
 *
 * Body : { template, ordinal (1-5), kind, misconception_id? }
 *
 * Crée toujours en brouillon (approved_at = NULL). Le prof doit explicitement
 * publier via PUT (séparation create/publish = sécurité contre les hints
 * AI-générés qui partiraient en prod sans review).
 *
 * Contrainte UNIQUE(question_id, ordinal) → si conflit, retourne 409 et
 * laisse le prof choisir un autre ordinal ou éditer le hint existant.
 *
 * Vérifie aussi que `misconception_id` (si fourni) appartient au concept de
 * la question (cohérence sémantique).
 */
export async function POST(
  request: Request,
  { params }: { params: { qid: string } },
) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (!isValidUuid(params.qid)) {
    return apiError("ID question invalide", 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError("Body JSON invalide", 400);
  }
  const validation = validateHintPostBody(rawBody);
  if (!validation.ok) return apiError(validation.error, validation.status);
  const { template, ordinal, kind, misconceptionId } = validation;

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const profileRes = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileRes.error) throw profileRes.error;
    const schoolId = (profileRes.data as { school_id?: string } | null)?.school_id;
    if (!schoolId) return apiError("Profil utilisateur incomplet", 403);

    // Tenant check + concept_id pour cohérence misconception
    const questionRes = await admin
      .from("teacher_questions")
      .select("id, school_id, concept_id")
      .eq("id", params.qid)
      .maybeSingle();
    if (questionRes.error) throw questionRes.error;
    const question = questionRes.data as
      | { id: string; school_id: string; concept_id: string | null }
      | null;
    if (!question) return apiError("Question introuvable", 404);
    if (question.school_id !== schoolId) return apiError("Accès refusé", 403);

    // Si misconception_id fourni, vérifier qu'il appartient au même concept
    if (misconceptionId !== null) {
      if (question.concept_id === null) {
        return apiError(
          "La question n'a pas de concept rattaché, impossible d'associer une misconception",
          400,
        );
      }
      const miscRes = await admin
        .from("concept_misconceptions")
        .select("id, concept_id, school_id")
        .eq("id", misconceptionId)
        .maybeSingle();
      if (miscRes.error) throw miscRes.error;
      const misc = miscRes.data as
        | { id: string; concept_id: string; school_id: string }
        | null;
      if (!misc) return apiError("Misconception introuvable", 404);
      if (misc.school_id !== schoolId) return apiError("Accès refusé sur misconception", 403);
      if (misc.concept_id !== question.concept_id) {
        return apiError(
          "Misconception ne correspond pas au concept de la question",
          400,
        );
      }
    }

    const insertRes = await admin
      .from("question_hints")
      .insert({
        question_id: params.qid,
        school_id: schoolId,
        template,
        ordinal,
        kind,
        misconception_id: misconceptionId,
        // approved_at reste NULL = brouillon (publication via PUT explicit)
      })
      .select(
        "id, ordinal, template, kind, misconception_id, approved_at, created_at, updated_at",
      )
      .single();

    if (insertRes.error) {
      // Conflit UNIQUE(question_id, ordinal) → 409 lisible
      if (insertRes.error.code === "23505") {
        return apiError(`Un indice existe déjà à la position ${ordinal}`, 409);
      }
      throw insertRes.error;
    }

    const inserted = insertRes.data as {
      id: string;
      ordinal: number;
      template: string;
      kind: string;
      misconception_id: string | null;
      approved_at: string | null;
      created_at: string;
      updated_at: string;
    };

    await logAuditEvent({
      actorId: user.id,
      actorEmail: user.email ?? null,
      actorRole: "teacher",
      eventType: AUDIT_EVENTS.CONCEPT_HINT_CREATED,
      targetType: "question_hint",
      targetId: inserted.id,
      details: {
        question_id: params.qid,
        ordinal: inserted.ordinal,
        kind: inserted.kind,
        misconception_id: inserted.misconception_id,
        template_length: inserted.template.length,
      },
    });

    return apiOk({ ok: true, hint: inserted }, 201);
  } catch (err) {
    return safeError(err, "curation-hints-create", "Erreur lors de la création de l'indice");
  }
}
