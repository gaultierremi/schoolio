/**
 * Sprint 6 PR S6-11 — Extraction de la logique de génération Plan Maïa.
 *
 * Pourquoi extraire : la route /api/student/plan-maia-daily GET contenait
 * 200+ lignes de génération inline. Avec S6-11 (cron nuit pré-génération),
 * la même logique doit être appelable :
 * - Depuis l'API GET (lazy, à la demande de l'élève)
 * - Depuis la task Trigger.dev (batch, pour tous les élèves actifs à 23:00 UTC)
 *
 * Le helper :
 * - Prend un userId + planDate
 * - Fait tous les fetches Supabase + appelle selectQuestionsForPlan
 * - INSERT ON CONFLICT race-safe
 * - Retourne { kind: "created" | "existing" | "no_classes" | "no_courses"
 *   | "no_candidates" | "all_correct_24h" | "no_data", plan? }
 *
 * Pas d'auth ici (le caller gère) — le helper accepte un userId quelconque
 * et utilise le service_role client. Sécurité tenant garantie par les
 * filtres .eq("student_user_id", userId) etc.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  selectQuestionsForPlan,
  type ConceptMastery,
  type QuestionCandidate,
} from "@/lib/plan-maia";
import { AUDIT_EVENTS, logAuditEvent } from "@/lib/audit/log";

export type PlanRow = {
  id: string;
  user_id: string;
  school_id: string;
  plan_date: string;
  plan_data: {
    question_ids: string[];
    reasons_by_question_id?: Record<string, { bucket: string; reason: string }>;
    strategy?: string;
    estimated_minutes?: number;
    concept_breakdown?: { faible: number; revision: number; nouveau: number };
    is_beginner_mode?: boolean;
  };
  target_minutes: number;
  completed_count: number;
  completed_at: string | null;
  generated_by: string;
  created_at: string;
  updated_at: string;
};

export type GenerationResult =
  | { kind: "existing"; plan: PlanRow }
  | { kind: "created"; plan: PlanRow }
  | { kind: "skipped"; reason: SkipReason };

export type SkipReason =
  | "no_profile"
  | "not_student"
  | "no_active_classes"
  | "no_assigned_courses"
  | "no_candidates"
  | "all_correct_24h"
  | "no_questions_generated";

// Type permissif pour matcher le retour de createClient sans accrocher les
// generics strictes de @supabase/supabase-js v2 (PostgrestVersion etc.).
// On passe le client depuis le caller qui l'a créé via createClient(...).
type AdminClient = SupabaseClient<any, any, any>;

/**
 * Génère (ou retourne l'existant) le plan Maïa pour un élève à une date donnée.
 *
 * Race-safe : INSERT ... ON CONFLICT (user_id, plan_date) DO NOTHING via
 * re-fetch en cas de 23505.
 *
 * @param admin - client service_role (caller doit fournir, évite recréer)
 * @param userId - UUID de l'élève
 * @param planDate - date ISO YYYY-MM-DD (timezone Europe/Brussels côté caller)
 * @param generatedBy - source : "lazy_runtime" | "batch_cron" | "manual"
 */
export async function generatePlanForStudent(
  admin: AdminClient,
  userId: string,
  planDate: string,
  generatedBy: "lazy_runtime" | "batch_cron" | "manual" = "lazy_runtime",
): Promise<GenerationResult> {
  // 1. Vérif plan existant (idempotent : cron peut tourner 2× sans casser)
  const existingRes = await admin
    .from("plan_maia_daily")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_date", planDate)
    .maybeSingle();
  if (existingRes.error) throw existingRes.error;
  if (existingRes.data) {
    return { kind: "existing", plan: existingRes.data as PlanRow };
  }

  // 2. Profil + school_id + role
  const profileRes = await admin
    .from("user_profiles")
    .select("school_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (profileRes.error) throw profileRes.error;
  const profile = profileRes.data as { school_id?: string; role?: string } | null;
  if (!profile?.school_id) return { kind: "skipped", reason: "no_profile" };
  if (profile.role !== "student") return { kind: "skipped", reason: "not_student" };
  const schoolId = profile.school_id;

  // 3. Classes actives non archivées (D20)
  const membershipsRes = await admin
    .from("class_memberships")
    .select("class_id, classes!inner(id, teacher_id, archived_at)")
    .eq("student_user_id", userId)
    .eq("status", "active");
  if (membershipsRes.error) throw membershipsRes.error;

  // Supabase peut retourner `classes` en array (typing strict) ou objet
  // (inférence lâche). On normalise via unknown cast pour rester compatible.
  type MembershipRow = {
    class_id: string;
    classes: { id: string; teacher_id: string; archived_at: string | null } | { id: string; teacher_id: string; archived_at: string | null }[];
  };
  const rawMemberships = (membershipsRes.data as unknown as MembershipRow[] | null) ?? [];
  const activeMemberships = rawMemberships.filter((m) => {
    const cls = Array.isArray(m.classes) ? m.classes[0] : m.classes;
    return cls && cls.archived_at === null;
  });
  if (activeMemberships.length === 0) {
    return { kind: "skipped", reason: "no_active_classes" };
  }

  const classIds = activeMemberships.map((m) => m.class_id);

  // 4. course_id des assignments actifs (B1)
  const assignmentsRes = await admin
    .from("assignments")
    .select("resource_id, resource_type")
    .in("class_id", classIds)
    .is("archived_at", null);
  if (assignmentsRes.error) throw assignmentsRes.error;

  const courseIds = [
    ...new Set(
      ((assignmentsRes.data as { resource_id: string; resource_type: string }[] | null) ?? [])
        .filter((a) => a.resource_type === "pdf" || a.resource_type === "quiz")
        .map((a) => a.resource_id),
    ),
  ];
  if (courseIds.length === 0) {
    return { kind: "skipped", reason: "no_assigned_courses" };
  }

  // 5. Questions candidates filtrées
  const candidatesRes = await admin
    .from("teacher_questions")
    .select("id, concept_id, subject_enum, difficulty_stars, type")
    .in("course_id", courseIds)
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .not("validated_at", "is", null)
    .is("rejected_at", null)
    .limit(500);
  if (candidatesRes.error) throw candidatesRes.error;
  const allCandidates = ((candidatesRes.data as Array<{
    id: string;
    concept_id: string | null;
    subject_enum: string | null;
    difficulty_stars: 1 | 2 | 3 | null;
    type: string;
  }> | null) ?? []) as QuestionCandidate[];
  if (allCandidates.length === 0) {
    return { kind: "skipped", reason: "no_candidates" };
  }

  // 6. Cool-down 24h (B6)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentCorrectRes = await admin
    .from("assignment_question_answers")
    .select("question_id")
    .eq("student_user_id", userId)
    .eq("is_correct", true)
    .gte("created_at", oneDayAgo);
  if (recentCorrectRes.error) throw recentCorrectRes.error;
  const recentCorrectIds = new Set(
    ((recentCorrectRes.data as { question_id: string }[] | null) ?? []).map((a) => a.question_id),
  );
  const candidates = allCandidates.filter((c) => !recentCorrectIds.has(c.id));
  if (candidates.length === 0) {
    return { kind: "skipped", reason: "all_correct_24h" };
  }

  // 7. Mastery + beginner mode
  const answersRes = await admin
    .from("assignment_question_answers")
    .select("question_id, is_correct, created_at")
    .eq("student_user_id", userId);
  if (answersRes.error) throw answersRes.error;
  type AnswerRow = { question_id: string; is_correct: boolean; created_at: string };
  const answerRows = (answersRes.data as AnswerRow[] | null) ?? [];
  const totalAnswersCount = answerRows.length;
  const isBeginnerMode = totalAnswersCount < 10;

  const conceptToStats = new Map<
    string,
    { correct: number; total: number; lastAt: string | null }
  >();
  if (answerRows.length > 0) {
    const answeredQuestionIds = [...new Set(answerRows.map((a) => a.question_id))];
    const qMapRes = await admin
      .from("teacher_questions")
      .select("id, concept_id")
      .in("id", answeredQuestionIds);
    if (qMapRes.error) throw qMapRes.error;
    const qToConcept = new Map<string, string | null>(
      ((qMapRes.data as { id: string; concept_id: string | null }[] | null) ?? []).map((q) => [
        q.id,
        q.concept_id,
      ]),
    );
    for (const a of answerRows) {
      const conceptId = qToConcept.get(a.question_id);
      if (!conceptId) continue;
      const stats = conceptToStats.get(conceptId) ?? { correct: 0, total: 0, lastAt: null };
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

  // 8. Génération
  const generated = selectQuestionsForPlan(candidates, masteryByConcept, {
    targetMinutes: 20,
    shuffleSeed: `${userId}:${planDate}`,
    isBeginnerMode,
    nowIso: new Date().toISOString(),
  });

  if (generated.questions.length === 0) {
    return { kind: "skipped", reason: "no_questions_generated" };
  }

  // 9. INSERT race-safe
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

  const insertRes = await admin
    .from("plan_maia_daily")
    .insert({
      user_id: userId,
      school_id: schoolId,
      plan_date: planDate,
      plan_data: planDataJson,
      target_minutes: 20,
      generated_by: generatedBy,
    })
    .select("*")
    .maybeSingle();

  let finalPlan: PlanRow | null = insertRes.data as PlanRow | null;

  if (insertRes.error || !finalPlan) {
    const code = (insertRes.error as { code?: string } | null)?.code;
    if (code === "23505" || !finalPlan) {
      const retryRes = await admin
        .from("plan_maia_daily")
        .select("*")
        .eq("user_id", userId)
        .eq("plan_date", planDate)
        .maybeSingle();
      if (retryRes.error) throw retryRes.error;
      if (retryRes.data) {
        return { kind: "existing", plan: retryRes.data as PlanRow };
      }
    }
    if (!finalPlan) throw insertRes.error ?? new Error("Plan insertion failed");
  }

  // 10. Audit log — fire-and-forget vrai (I6 hot-fix : pas de await pour
  //     ne pas rallonger N × 200ms quand le cron itère 90+ élèves)
  void logAuditEvent({
    actorId: userId,
    actorRole: generatedBy === "batch_cron" ? "system" : "student",
    eventType: AUDIT_EVENTS.PLAN_MAIA_GENERATED,
    targetType: "plan_maia_daily",
    targetId: finalPlan.id,
    details: {
      strategy: generated.strategy,
      questions_count: generated.questions.length,
      estimated_minutes: generated.estimatedMinutes,
      generated_by: generatedBy,
    },
  });

  return { kind: "created", plan: finalPlan };
}

/**
 * Liste tous les élèves "actifs" pour le batch cron : profile.role='student'
 * avec au moins une class_membership active dans une classe non-archivée.
 *
 * Limit safety à 5000 (pré-pilote on est largement en-dessous, défense
 * contre une explosion de coût si un bug d'orchestration générait des
 * inscriptions massives).
 */
export async function listActiveStudents(admin: AdminClient): Promise<string[]> {
  const res = await admin
    .from("class_memberships")
    .select("student_user_id, classes!inner(archived_at)")
    .eq("status", "active")
    .is("classes.archived_at", null)
    .limit(5000);
  if (res.error) throw res.error;
  type Row = { student_user_id: string; classes: { archived_at: string | null }[] };
  const rows = (res.data as Row[] | null) ?? [];
  // Dedupe (un élève peut être dans plusieurs classes)
  return Array.from(new Set(rows.map((r) => r.student_user_id)));
}
