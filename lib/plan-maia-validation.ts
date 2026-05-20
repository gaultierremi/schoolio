/**
 * Sprint 6 dette tech — Validation défensive runtime des rows Plan Maïa.
 *
 * Extrait de l'inline `isValidPlanRow` qui existait dans
 * `/accueil/plan-maia/today/page.tsx` (et qui manquait dans `bilan/page.tsx`
 * et `quiz/page.tsx`, hard review S5-1 D4).
 *
 * Pourquoi un type guard runtime ? Le cast `as PlanRow` après un `select("*")`
 * Supabase est silencieux : si le schéma DB drift ou si une row a un
 * `plan_data` corrompu (migration partielle, INSERT manuel, etc.), TS ne
 * voit rien et la page crash sur `plan.plan_data.question_ids.map(...)`.
 *
 * Ce helper :
 * - Valide les champs critiques avant accès
 * - Permet aux server components de rediriger gracieusement (redirect)
 *   plutôt que crash 500 sur le user
 *
 * Pas de validation exhaustive (on ne replique pas zod) : seulement les
 * champs effectivement déréférencés par la page. Volontairement minimaliste.
 */

/**
 * Shape minimale attendue d'une row plan_maia_daily pour render UI sans crash.
 * Les champs optionnels (`reasons_by_question_id`, `strategy`, etc.) ne sont
 * pas validés ici car leur accès est déjà guard via `?.` dans les pages.
 */
export type ValidPlanRow = {
  id: string;
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
};

/**
 * Type guard runtime : valide les champs critiques avant accès UI.
 *
 * Retourne true si la row peut être déréférencée en toute sécurité dans
 * les pages /accueil/plan-maia/today, /today/bilan, /today/quiz.
 */
export function isValidPlanRow(row: unknown): row is ValidPlanRow {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;

  if (typeof r.id !== "string") return false;
  if (typeof r.target_minutes !== "number") return false;
  if (typeof r.completed_count !== "number") return false;

  // completed_at peut être null (plan en cours) ou string ISO (terminé)
  if (r.completed_at !== null && typeof r.completed_at !== "string") return false;

  if (!r.plan_data || typeof r.plan_data !== "object") return false;
  const pd = r.plan_data as Record<string, unknown>;

  if (!Array.isArray(pd.question_ids)) return false;
  if (!pd.question_ids.every((id) => typeof id === "string")) return false;

  return true;
}
