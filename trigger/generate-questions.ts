// Trigger.dev task : génération de questions à partir d'un PDF de cours.
//
// Pattern : la route POST /api/courses/generate-questions crée la row
// `question_generation_jobs` (validation + auth + plafond) puis trigger
// cette task avec { jobId }. La task fetch le job + course, fait tout le
// boulot (download PDF, workers Anthropic, normalize, INSERT), update
// progressivement la row jobs pour que le client puisse poller le progress.
//
// Pourquoi pas waitUntil ? Avant cette migration, on utilisait waitUntil de
// @vercel/functions. Sur jobs longs (~2-4min Anthropic streaming PDF Vision),
// Vercel killait silencieusement le background process → jobs stuck phase=
// generating_workers, aucun error log capturable. Trigger.dev cloud run
// jusqu'à 5min en free / 1h en pro, sans kill mid-execution.

import { task } from "@trigger.dev/sdk/v3";
import { runGenerationForJob } from "@/lib/generate-questions/runner";

const UUID_REGEX = /^[0-9a-f-]{36}$/i;

export const generateQuestionsTask = task({
  id: "generate-questions",
  // 10min : permet 15-20 chapitres × 3 concurrent × ~30-60s/chapter sereinement.
  // Free tier Trigger.dev autorise jusqu'à 1h, on consomme juste plus de compute
  // du quota mensuel (50 GB-h compute) — négligeable pour le dogfood actuel.
  maxDuration: 600,
  retry: {
    // Pas de retry automatique au niveau de la task : si on plante, le
    // runner a déjà mis status=failed dans la row jobs et le client
    // affichera l'erreur. Un retry massif coûterait des appels Anthropic
    // pour rien si la cause est structurelle (PDF corrompu, etc.).
    maxAttempts: 1,
  },
  run: async (payload: { jobId: string }) => {
    if (!payload?.jobId || typeof payload.jobId !== "string" || !UUID_REGEX.test(payload.jobId)) {
      throw new Error("Invalid payload: jobId UUID requis");
    }

    await runGenerationForJob(payload.jobId);

    // Le runner update lui-même la row jobs avec status final.
    // Cette valeur n'est pas consommée par la route (le client poll la table)
    // mais utile pour debug dans le dashboard Trigger.dev.
    return { jobId: payload.jobId, done: true };
  },
});
