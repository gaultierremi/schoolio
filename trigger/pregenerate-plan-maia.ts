/**
 * Sprint 6 PR S6-11 — Cron nuit pré-génération Plan Maïa.
 *
 * Schedule : 23:00 UTC quotidien
 *   - Hiver Brussels (UTC+1) → 00:00 local (jour J vient de commencer)
 *   - Été Brussels (UTC+2)   → 01:00 local
 *
 * Choix de 23:00 UTC (et pas 22:00 ou 00:00) :
 *   - Garantit qu'on est APRÈS minuit local en toute saison.
 *   - `todayInBelgium()` retourne donc bien la date du jour J.
 *   - Si on tournait à 22:00 UTC en hiver (= 23:00 local J-1), on
 *     pré-générerait pour J-1 et l'élève le verrait pas le matin.
 *
 * Idempotent : `generatePlanForStudent` fait un SELECT existing avant
 * INSERT. Si la task échoue mi-batch et retourne, les élèves déjà
 * générés sont skip-existing.
 *
 * Pas d'appel IA runtime (mémoire `project_plan_maia_daily` + algo
 * déterministe S4-1) → aucun coût Anthropic, on peut tourner sereinement.
 *
 * Concurrency : séquentiel pour MVP (3 écoles pilotes × ~30 élèves =
 * ~90 élèves × ~200ms agrégation = ~18s). Loin du maxDuration 600s.
 */

import { logger, schedules } from "@trigger.dev/sdk/v3";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { todayInBelgium } from "@/lib/plan-maia-date";
import {
  generatePlanForStudent,
  listActiveStudents,
  type SkipReason,
} from "@/lib/plan-maia-generation";

export const pregeneratePlanMaiaTask = schedules.task({
  id: "pregenerate-plan-maia-nightly",
  // 23:00 UTC = 00:00 local hiver, 01:00 local été
  cron: "0 23 * * *",
  maxDuration: 300, // 5 min — large pour pilote (3 écoles × 30 élèves)

  run: async () => {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const planDate = todayInBelgium();
    logger.info("Pre-generating Plan Maïa for date", { planDate });

    const studentIds = await listActiveStudents(admin);
    logger.info("Active students found", { count: studentIds.length });

    const counters = {
      created: 0,
      existing: 0,
      skipped: 0,
      failed: 0,
    };
    const skipReasons: Partial<Record<SkipReason, number>> = {};
    const failures: { userId: string; error: string }[] = [];

    // Séquentiel volontaire pour MVP : facilite debug + RLS friendly.
    // Si volume > 500 élèves, basculer sur Promise.all avec pLimit(10).
    for (const userId of studentIds) {
      try {
        const result = await generatePlanForStudent(admin, userId, planDate, "batch_cron");
        if (result.kind === "created") counters.created += 1;
        else if (result.kind === "existing") counters.existing += 1;
        else if (result.kind === "skipped") {
          counters.skipped += 1;
          skipReasons[result.reason] = (skipReasons[result.reason] ?? 0) + 1;
        }
      } catch (err) {
        counters.failed += 1;
        const errMsg = err instanceof Error ? err.message : String(err);
        failures.push({ userId, error: errMsg });
        logger.error("Failed to generate plan for student", { userId, error: errMsg });
      }
    }

    logger.info("Pre-generation done", {
      planDate,
      totalStudents: studentIds.length,
      counters,
      skipReasons,
      failuresCount: failures.length,
    });

    return {
      planDate,
      totalStudents: studentIds.length,
      counters,
      skipReasons,
      // On limite à 10 failures dans le retour pour éviter payload énorme
      sampleFailures: failures.slice(0, 10),
    };
  },
});
