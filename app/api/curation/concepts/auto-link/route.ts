import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";
import {
  proposeConceptLinks,
  type ConceptForLinking,
  type QuestionForLinking,
  type LinkProposal,
} from "@/lib/concept-linker";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — un syllabus de 200 questions = ~10 batches Haiku

/**
 * POST /api/curation/concepts/auto-link
 *
 * Feedback Alex 2026-05-25 : "pourquoi ne pourrait-on pas remplir tout et
 * lier tous les concepts et les questions ?"
 *
 * Backfill batch : scan toutes les `teacher_questions` du tenant dont
 * `concept_id IS NULL`, demande à Claude Haiku de proposer un concept_id
 * pour chaque, applique automatiquement les liens confiance ≥ 0.85.
 *
 * Body : { course_id?: string }  // optionnel : scope à un cours précis
 *
 * Stratégie hybride (PR 1 = auto-apply seul) :
 * - ≥ 0.85 → UPDATE concept_id direct
 * - 0.5–0.85 → skip pour l'instant (review queue arrivera en PR 2)
 * - < 0.5 → skip
 *
 * Response :
 * {
 *   ok: true,
 *   stats: {
 *     questions_scanned: N,
 *     auto_applied: N,
 *     to_review: N,         // saved-skipped en PR 1, persistera en PR 2
 *     skipped_low_confidence: N,
 *     skipped_no_concepts: bool,
 *   },
 *   proposals_to_review: [...]  // liste pour anticipation UI (limit 50)
 * }
 *
 * Coût : ~$0.013 / batch de 20 questions × ~30 concepts.
 * Auth : requireTeacher + filtre par school_id.
 */
export async function POST(request: Request) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  let body: { course_id?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // Body optionnel
  }

  let courseId: string | null = null;
  if (typeof body.course_id === "string") {
    if (!/^[0-9a-f-]{36}$/i.test(body.course_id)) {
      return apiError("course_id invalide", 400);
    }
    courseId = body.course_id;
  }

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1. Tenant
    const { data: profile } = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    const schoolId = (profile as { school_id?: string } | null)?.school_id;
    if (!schoolId) return apiError("Profil utilisateur incomplet", 403);

    // 2. Concepts du tenant (avec uaa name pour mieux désambiguïser)
    const { data: conceptsData, error: cErr } = await admin
      .from("concepts")
      .select("id, name, description, uaa:uaa_id(name)")
      .eq("school_id", schoolId)
      .order("name", { ascending: true })
      .limit(200);
    if (cErr) throw cErr;
    type ConceptRow = {
      id: string;
      name: string;
      description: string | null;
      uaa: { name: string | null } | { name: string | null }[] | null;
    };
    const concepts: ConceptForLinking[] = ((conceptsData ?? []) as ConceptRow[]).map((c) => {
      const uaa = Array.isArray(c.uaa) ? c.uaa[0] : c.uaa;
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        uaa_name: uaa?.name ?? null,
      };
    });

    if (concepts.length === 0) {
      return apiOk({
        ok: true,
        stats: {
          questions_scanned: 0,
          auto_applied: 0,
          to_review: 0,
          skipped_low_confidence: 0,
          skipped_no_concepts: true,
        },
        proposals_to_review: [],
      });
    }

    // 3. Questions sans concept_id du tenant (+ filtre optionnel sur course_id)
    let qQuery = admin
      .from("teacher_questions")
      .select("id, question, course_id")
      .eq("school_id", schoolId)
      .is("concept_id", null)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(500);
    if (courseId) {
      qQuery = qQuery.eq("course_id", courseId);
    }
    const { data: qData, error: qErr } = await qQuery;
    if (qErr) throw qErr;
    type QRow = { id: string; question: string; course_id: string | null };
    const allQuestions = (qData ?? []) as QRow[];
    const questions: QuestionForLinking[] = allQuestions.map((q) => ({
      id: q.id,
      question: q.question,
    }));

    if (questions.length === 0) {
      return apiOk({
        ok: true,
        stats: {
          questions_scanned: 0,
          auto_applied: 0,
          to_review: 0,
          skipped_low_confidence: 0,
          skipped_no_concepts: false,
        },
        proposals_to_review: [],
      });
    }

    // 4. Propositions Claude Haiku (batchées en interne)
    const proposals: LinkProposal[] = await proposeConceptLinks(questions, concepts);

    // 5. Bucket les propositions
    const autoApply = proposals.filter((p) => p.action === "auto_apply");
    const toReview = proposals.filter((p) => p.action === "review");
    const skipped = proposals.filter((p) => p.action === "skip");

    // 6. UPDATE en bulk pour auto-apply
    let autoApplied = 0;
    if (autoApply.length > 0) {
      for (const p of autoApply) {
        if (!p.concept_id) continue; // safety
        const { error: updateErr } = await admin
          .from("teacher_questions")
          .update({ concept_id: p.concept_id })
          .eq("id", p.question_id)
          .eq("school_id", schoolId) // double-check tenant
          .is("concept_id", null); // race-safe (n'overwrite pas si déjà liée manuellement)
        if (updateErr) {
          console.error("[concepts/auto-link] update failed", p.question_id, updateErr);
          continue;
        }
        autoApplied++;
      }
    }

    // 7. Audit log (fire-and-forget)
    void logAuditEvent({
      actorId: user.id,
      actorRole: "teacher",
      eventType: AUDIT_EVENTS.CONCEPT_AUTO_LINK_RAN,
      targetType: "school",
      targetId: schoolId,
      details: {
        questions_scanned: questions.length,
        auto_applied: autoApplied,
        to_review: toReview.length,
        skipped: skipped.length,
        course_id: courseId,
      },
    });

    return apiOk({
      ok: true,
      stats: {
        questions_scanned: questions.length,
        auto_applied: autoApplied,
        to_review: toReview.length,
        skipped_low_confidence: skipped.length,
        skipped_no_concepts: false,
      },
      // Limite UI : on remonte max 50 propositions à review pour anticiper PR 2
      proposals_to_review: toReview.slice(0, 50),
    });
  } catch (err) {
    return safeError(err, "concepts-auto-link");
  }
}
