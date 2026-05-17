import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { selectQuestionsForPlan, type ConceptMastery, type QuestionCandidate } from "@/lib/plan-maia";

export const runtime = "nodejs";

/**
 * GET /api/student/plan-maia-daily?date=YYYY-MM-DD (optionnel)
 *
 * Sprint 4 PR S4-1 — Plan Maïa quotidien (lazy generation).
 *
 * Mémoire `project_plan_maia_daily` :
 *   "20 min multi-matière auto chaque matin, pick-and-choose, équilibré
 *    non-adaptatif au skip"
 *
 * Stratégie lazy : si le plan du jour existe → return. Sinon génère via
 * `selectQuestionsForPlan` + INSERT + return. Batch cron Sprint 4b prendra
 * le relais pour pré-générer la nuit.
 *
 * Auth : élève authentifié uniquement (RLS additionnel).
 *
 * Response shape :
 * {
 *   ok: true,
 *   plan: {
 *     id, plan_date,
 *     questions: [{ question_id, bucket, reason }],
 *     concept_breakdown: { faible, revision, nouveau },
 *     target_minutes, estimated_minutes,
 *     completed_count, completed_at,
 *     generated_by: 'lazy_runtime' | 'batch_cron' | 'manual'
 *   }
 * }
 *
 * Si l'élève n'a aucune classe active OU aucune question disponible, retourne
 * `plan: null` avec un message explicatif.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const planDate = dateParam ?? todayIsoDate();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
    return apiError("Date invalide (attendu YYYY-MM-DD)", 400);
  }

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1. Profil + school_id
    const { data: profile } = await admin
      .from("user_profiles")
      .select("school_id, role")
      .eq("id", user.id)
      .maybeSingle();
    const schoolId = (profile as { school_id?: string; role?: string } | null)?.school_id;
    const role = (profile as { school_id?: string; role?: string } | null)?.role;
    if (!schoolId) return apiError("Profil utilisateur incomplet", 403);
    if (role !== "student") return apiError("Plan Maïa réservé aux élèves", 403);

    // 2. Plan existant ?
    const { data: existing } = await admin
      .from("plan_maia_daily")
      .select("*")
      .eq("user_id", user.id)
      .eq("plan_date", planDate)
      .maybeSingle();

    if (existing) {
      return apiOk({ ok: true, plan: toApiPlan(existing as PlanRow) });
    }

    // 3. Génération lazy : récupérer questions disponibles + mastery élève
    //    a. Classes de l'élève
    const { data: memberships } = await admin
      .from("class_memberships")
      .select("class_id")
      .eq("student_user_id", user.id)
      .eq("status", "active");
    const classIds =
      (memberships as { class_id: string }[] | null)?.map((m) => m.class_id) ?? [];
    if (classIds.length === 0) {
      return apiOk({
        ok: true,
        plan: null,
        message: "Tu n'es inscrit dans aucune classe — pas de plan possible.",
      });
    }

    //    b. Cours de ces classes via assignments? Non — l'élève a accès à tous
    //       les cours partagés par les profs des classes. Pour MVP simpler :
    //       on prend toutes les teacher_questions actives du tenant école dont
    //       les profs enseignent à l'élève (= teacher_id IN class_memberships
    //       → classes → teacher_id).
    const { data: classRows } = await admin
      .from("classes")
      .select("teacher_id")
      .in("id", classIds);
    const teacherIds = [
      ...new Set(
        (classRows as { teacher_id: string }[] | null)?.map((r) => r.teacher_id) ?? [],
      ),
    ];
    if (teacherIds.length === 0) {
      return apiOk({
        ok: true,
        plan: null,
        message: "Aucun professeur trouvé pour tes classes.",
      });
    }

    //    c. Questions candidates : is_active=true, validated_at NOT NULL,
    //       teacher_id IN teacherIds, school_id = schoolId
    const { data: candidatesData } = await admin
      .from("teacher_questions")
      .select("id, concept_id, subject_enum, difficulty_stars, type")
      .in("teacher_id", teacherIds)
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .not("validated_at", "is", null)
      .is("rejected_at", null)
      .limit(500);
    const candidates = ((candidatesData as Array<{
      id: string;
      concept_id: string | null;
      subject_enum: string | null;
      difficulty_stars: 1 | 2 | 3 | null;
      type: string;
    }> | null) ?? []) as QuestionCandidate[];

    if (candidates.length === 0) {
      return apiOk({
        ok: true,
        plan: null,
        message: "Aucune question disponible aujourd'hui — reviens plus tard.",
      });
    }

    //    d. Mastery élève par concept (depuis assignment_question_answers)
    const { data: answersData } = await admin
      .from("assignment_question_answers")
      .select("question_id, is_correct, created_at")
      .eq("student_user_id", user.id);
    type AnswerRow = { question_id: string; is_correct: boolean; created_at: string };
    const answerRows = (answersData as AnswerRow[] | null) ?? [];

    // Aggregate by concept_id
    const conceptToStats = new Map<
      string,
      { correct: number; total: number; lastAt: string | null }
    >();
    // Need question → concept mapping for all answered questions
    if (answerRows.length > 0) {
      const answeredQuestionIds = [...new Set(answerRows.map((a) => a.question_id))];
      const { data: qMapData } = await admin
        .from("teacher_questions")
        .select("id, concept_id")
        .in("id", answeredQuestionIds);
      const qToConcept = new Map<string, string | null>(
        ((qMapData as { id: string; concept_id: string | null }[] | null) ?? []).map((q) => [
          q.id,
          q.concept_id,
        ]),
      );
      for (const a of answerRows) {
        const conceptId = qToConcept.get(a.question_id);
        if (!conceptId) continue;
        const stats = conceptToStats.get(conceptId) ?? {
          correct: 0,
          total: 0,
          lastAt: null,
        };
        stats.total += 1;
        if (a.is_correct) stats.correct += 1;
        if (!stats.lastAt || a.created_at > stats.lastAt) stats.lastAt = a.created_at;
        conceptToStats.set(conceptId, stats);
      }
    }

    const masteryByConcept: ConceptMastery[] = Array.from(conceptToStats.entries()).map(
      ([concept_id, s]) => ({
        concept_id,
        mastery_pct: s.total === 0 ? null : Math.round((100 * s.correct) / s.total),
        last_answered_at: s.lastAt,
      }),
    );

    // 4. Générer le plan
    const generated = selectQuestionsForPlan(candidates, masteryByConcept, 20);

    if (generated.questions.length === 0) {
      return apiOk({
        ok: true,
        plan: null,
        message: "Pas assez de données pour générer un plan personnalisé. Continue d'avancer dans tes devoirs.",
      });
    }

    // 5. INSERT plan en DB (jamais d'écriture côté client, RLS bloque)
    const planDataJson = {
      question_ids: generated.questions.map((q) => q.question_id),
      reasons_by_question_id: Object.fromEntries(
        generated.questions.map((q) => [q.question_id, { bucket: q.bucket, reason: q.reason }]),
      ),
      strategy: generated.strategy,
      estimated_minutes: generated.estimatedMinutes,
    };

    const { data: inserted, error: insertError } = await admin
      .from("plan_maia_daily")
      .insert({
        user_id: user.id,
        school_id: schoolId,
        plan_date: planDate,
        plan_data: planDataJson,
        target_minutes: 20,
        generated_by: "lazy_runtime",
      })
      .select("*")
      .single();
    if (insertError || !inserted) {
      // Race condition possible : autre call a inséré entretemps
      const { data: retry } = await admin
        .from("plan_maia_daily")
        .select("*")
        .eq("user_id", user.id)
        .eq("plan_date", planDate)
        .maybeSingle();
      if (retry) return apiOk({ ok: true, plan: toApiPlan(retry as PlanRow) });
      throw insertError ?? new Error("Plan insertion failed");
    }

    return apiOk({ ok: true, plan: toApiPlan(inserted as PlanRow) });
  } catch (err) {
    return safeError(err, "student-plan-maia-daily", "Erreur lors du chargement du plan");
  }
}

// ────────────────────────────────────────────────────────────────────────

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type PlanRow = {
  id: string;
  user_id: string;
  plan_date: string;
  plan_version: number;
  plan_data: {
    question_ids: string[];
    reasons_by_question_id?: Record<string, { bucket: string; reason: string }>;
    strategy?: string;
    estimated_minutes?: number;
  };
  target_minutes: number;
  generated_by: string;
  generated_at: string;
  completed_count: number;
  completed_at: string | null;
};

function toApiPlan(row: PlanRow) {
  return {
    id: row.id,
    plan_date: row.plan_date,
    plan_version: row.plan_version,
    question_ids: row.plan_data.question_ids ?? [],
    reasons_by_question_id: row.plan_data.reasons_by_question_id ?? {},
    strategy: row.plan_data.strategy,
    estimated_minutes: row.plan_data.estimated_minutes ?? row.target_minutes,
    target_minutes: row.target_minutes,
    generated_by: row.generated_by,
    generated_at: row.generated_at,
    completed_count: row.completed_count,
    completed_at: row.completed_at,
  };
}
