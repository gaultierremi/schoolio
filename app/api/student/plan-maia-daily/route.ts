import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";
import { selectQuestionsForPlan, type ConceptMastery, type QuestionCandidate } from "@/lib/plan-maia";
import { todayInBelgium, isValidIsoDate } from "@/lib/plan-maia-date";

export const runtime = "nodejs";

/**
 * GET /api/student/plan-maia-daily?date=YYYY-MM-DD (optionnel)
 *
 * Sprint 4 PR S4-1 — Plan Maïa quotidien (lazy generation).
 *
 * Mémoire `project_plan_maia_daily` : 20 min multi-matière auto chaque matin,
 * pick-and-choose, équilibré non-adaptatif au skip.
 *
 * Fixes hard review :
 * - B1 : filter par `course_id` des assignments actifs (isolation classe/niveau)
 * - B3 : timezone Europe/Brussels via `todayInBelgium`
 * - B5 : passe `last_answered_at` à l'algo (spaced repetition)
 * - B6 : exclusion questions répondues correctement dans 24h (cool-down)
 * - I12 : audit log `plan_maia_generated`
 * - I16 : INSERT ON CONFLICT DO NOTHING + RETURNING (race-safe sans throw)
 * - D17 : shuffle seed = hash(user_id + plan_date) déterministe par jour/élève
 * - D19 : beginner mode si < 10 réponses totales
 * - D20 : exclure les classes `archived_at IS NOT NULL`
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  // B3 fix : timezone Europe/Brussels (pas UTC)
  const planDate = dateParam ?? todayInBelgium();

  if (!isValidIsoDate(planDate)) {
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

    // 3. Génération lazy
    //    a. Classes de l'élève actives ET non archivées (D20 fix)
    const { data: memberships } = await admin
      .from("class_memberships")
      .select("class_id, classes!inner(id, teacher_id, archived_at)")
      .eq("student_user_id", user.id)
      .eq("status", "active");

    type MembershipRow = {
      class_id: string;
      classes: { id: string; teacher_id: string; archived_at: string | null };
    };
    const activeMemberships = ((memberships as MembershipRow[] | null) ?? []).filter(
      (m) => m.classes.archived_at === null,
    );

    if (activeMemberships.length === 0) {
      return apiOk({
        ok: true,
        plan: null,
        message: "Tu n'es inscrit dans aucune classe active — pas de plan possible.",
      });
    }

    const classIds = activeMemberships.map((m) => m.class_id);

    //    b. Récupérer les `course_id` des assignments actifs de ces classes (B1 fix)
    //       → ne pas servir n'importe quelle question du prof, seulement celles
    //         des cours réellement assignés aux classes où l'élève est inscrit
    const { data: assignmentsData } = await admin
      .from("assignments")
      .select("resource_id, resource_type")
      .in("class_id", classIds)
      .is("archived_at", null);

    const courseIds = [
      ...new Set(
        ((assignmentsData as { resource_id: string; resource_type: string }[] | null) ?? [])
          .filter((a) => a.resource_type === "pdf" || a.resource_type === "quiz")
          .map((a) => a.resource_id),
      ),
    ];

    if (courseIds.length === 0) {
      return apiOk({
        ok: true,
        plan: null,
        message: "Aucun cours assigné pour l'instant — reviens quand ton prof distribuera un devoir.",
      });
    }

    //    c. Questions candidates filtrées par course_id (pas plus teacher_id global)
    const { data: candidatesData } = await admin
      .from("teacher_questions")
      .select("id, concept_id, subject_enum, difficulty_stars, type")
      .in("course_id", courseIds)
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .not("validated_at", "is", null)
      .is("rejected_at", null)
      .limit(500);
    const allCandidates = ((candidatesData as Array<{
      id: string;
      concept_id: string | null;
      subject_enum: string | null;
      difficulty_stars: 1 | 2 | 3 | null;
      type: string;
    }> | null) ?? []) as QuestionCandidate[];

    if (allCandidates.length === 0) {
      return apiOk({
        ok: true,
        plan: null,
        message: "Pas encore de questions disponibles dans tes cours.",
      });
    }

    //    d. Cool-down 24h (B6) : exclure questions répondues CORRECTEMENT dans 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentCorrectAnswers } = await admin
      .from("assignment_question_answers")
      .select("question_id")
      .eq("student_user_id", user.id)
      .eq("is_correct", true)
      .gte("created_at", oneDayAgo);
    const recentCorrectIds = new Set(
      ((recentCorrectAnswers as { question_id: string }[] | null) ?? []).map(
        (a) => a.question_id,
      ),
    );
    const candidates = allCandidates.filter((c) => !recentCorrectIds.has(c.id));

    if (candidates.length === 0) {
      return apiOk({
        ok: true,
        plan: null,
        message: "Tu as déjà bien répondu à toutes les questions disponibles aujourd'hui — repose-toi !",
      });
    }

    //    e. Mastery élève par concept + total answers count (D19 beginner mode)
    const { data: answersData } = await admin
      .from("assignment_question_answers")
      .select("question_id, is_correct, created_at")
      .eq("student_user_id", user.id);
    type AnswerRow = { question_id: string; is_correct: boolean; created_at: string };
    const answerRows = (answersData as AnswerRow[] | null) ?? [];
    const totalAnswersCount = answerRows.length;
    const isBeginnerMode = totalAnswersCount < 10;

    const conceptToStats = new Map<
      string,
      { correct: number; total: number; lastAt: string | null }
    >();
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
        mastery_pct: Math.round((100 * s.correct) / s.total),
        last_answered_at: s.lastAt,
      }),
    );

    // 4. Générer le plan avec toutes les options
    const generated = selectQuestionsForPlan(candidates, masteryByConcept, {
      targetMinutes: 20,
      // D17 : shuffle déterministe par (user, date)
      shuffleSeed: `${user.id}:${planDate}`,
      isBeginnerMode,
      nowIso: new Date().toISOString(),
    });

    if (generated.questions.length === 0) {
      return apiOk({
        ok: true,
        plan: null,
        message: "Pas assez de données pour générer un plan personnalisé. Continue tes devoirs.",
      });
    }

    // 5. INSERT plan en DB avec ON CONFLICT (race-safe, I16 fix)
    const planDataJson = {
      question_ids: generated.questions.map((q) => q.question_id),
      reasons_by_question_id: Object.fromEntries(
        generated.questions.map((q) => [q.question_id, { bucket: q.bucket, reason: q.reason }]),
      ),
      strategy: generated.strategy,
      estimated_minutes: generated.estimatedMinutes,
      concept_breakdown: generated.conceptBreakdown,
      is_beginner_mode: isBeginnerMode,
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
      .maybeSingle();

    let finalPlan: PlanRow | null = inserted as PlanRow | null;

    if (insertError || !finalPlan) {
      // Race condition (UNIQUE conflict) — re-fetch celui qui a gagné
      const code = (insertError as { code?: string } | null)?.code;
      if (code === "23505" || !finalPlan) {
        const { data: retry } = await admin
          .from("plan_maia_daily")
          .select("*")
          .eq("user_id", user.id)
          .eq("plan_date", planDate)
          .maybeSingle();
        if (retry) finalPlan = retry as PlanRow;
      }
      if (!finalPlan) throw insertError ?? new Error("Plan insertion failed");
    } else {
      // I12 : audit log (fire-and-forget)
      await logAuditEvent({
        actorId: user.id,
        actorEmail: user.email ?? null,
        actorRole: "student",
        eventType: AUDIT_EVENTS.PLAN_MAIA_GENERATED,
        targetType: "plan_maia_daily",
        targetId: finalPlan.id,
        details: {
          plan_date: planDate,
          strategy: generated.strategy,
          question_count: generated.questions.length,
          concept_breakdown: generated.conceptBreakdown,
          is_beginner_mode: isBeginnerMode,
          generated_by: "lazy_runtime",
        },
      });
    }

    return apiOk({ ok: true, plan: toApiPlan(finalPlan) });
  } catch (err) {
    return safeError(err, "student-plan-maia-daily", "Erreur lors du chargement du plan");
  }
}

// ────────────────────────────────────────────────────────────────────────

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
    concept_breakdown?: { faible: number; revision: number; nouveau: number };
    is_beginner_mode?: boolean;
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
    concept_breakdown: row.plan_data.concept_breakdown,
    is_beginner_mode: row.plan_data.is_beginner_mode ?? false,
    generated_by: row.generated_by,
    generated_at: row.generated_at,
    completed_count: row.completed_count,
    completed_at: row.completed_at,
  };
}
