import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { generatePlanForStudent, type SkipReason } from "@/lib/plan-maia-generation";
import { todayInBelgium, isValidIsoDate } from "@/lib/plan-maia-date";

export const runtime = "nodejs";

/**
 * GET /api/student/plan-maia-daily?date=YYYY-MM-DD (optionnel)
 *
 * Sprint 4 PR S4-1 — Plan Maïa quotidien (lazy generation).
 * Sprint 6 PR S6-11 — Refactor : la logique de génération est extraite dans
 * `lib/plan-maia-generation.ts` pour réutilisation par le cron Trigger.dev
 * (`trigger/pregenerate-plan-maia.ts`).
 *
 * Mémoire `project_plan_maia_daily` : 20 min multi-matière auto chaque matin,
 * pick-and-choose, équilibré non-adaptatif au skip.
 *
 * Comportement :
 * - Si plan déjà existant pour (user_id, planDate) → retourné sans regen
 * - Sinon génération lazy via helper + INSERT race-safe
 * - Cas "skipped" → 200 ok avec plan=null + message user-facing
 * - Cas not_student/no_profile → 403 (problème de compte, pas pédagogique)
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const planDate = dateParam ?? todayInBelgium();

  if (!isValidIsoDate(planDate)) {
    return apiError("Date invalide (attendu YYYY-MM-DD)", 400);
  }

  try {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const result = await generatePlanForStudent(admin, user.id, planDate, "lazy_runtime");

    if (result.kind === "existing" || result.kind === "created") {
      return apiOk({ ok: true, plan: toApiPlan(result.plan as PlanRow) });
    }

    // result.kind === "skipped" → mapper reason → message UX
    if (result.reason === "no_profile" || result.reason === "not_student") {
      return apiError(SKIP_MESSAGES[result.reason], 403);
    }
    return apiOk({
      ok: true,
      plan: null,
      message: SKIP_MESSAGES[result.reason],
    });
  } catch (err) {
    return safeError(err, "student-plan-maia-daily", "Erreur lors du chargement du plan");
  }
}

// ────────────────────────────────────────────────────────────────────────

const SKIP_MESSAGES: Record<SkipReason, string> = {
  no_profile: "Profil utilisateur incomplet",
  not_student: "Plan Maïa réservé aux élèves",
  no_active_classes:
    "Tu n'es inscrit dans aucune classe active — pas de plan possible.",
  no_assigned_courses:
    "Aucun cours assigné pour l'instant — reviens quand ton prof distribuera un devoir.",
  no_candidates: "Pas encore de questions disponibles dans tes cours.",
  all_correct_24h:
    "Tu as déjà bien répondu à toutes les questions disponibles aujourd'hui — repose-toi !",
  no_questions_generated:
    "Pas assez de données pour générer un plan personnalisé. Continue tes devoirs.",
};

type PlanRow = {
  id: string;
  user_id: string;
  plan_date: string;
  plan_version?: number;
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
  generated_at?: string;
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
