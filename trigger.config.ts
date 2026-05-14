import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  // Project ref provenant du dashboard Trigger.dev.
  // Source de vérité : la variable d'env TRIGGER_PROJECT_REF côté Vercel,
  // mais on hardcode ici car ce fichier est lu au build par la CLI
  // `npx trigger.dev deploy` qui n'a pas accès aux env Vercel.
  project: "proj_tejhmiwoumzmncugvrhy",
  runtime: "node",
  dirs: ["./trigger"],

  // 10min par défaut : gros syllabus 200p × 15-20 chapitres avec 3 concurrent
  // peut friser les 5min, on prend de la marge. Free tier accepte (juste
  // plus de compute consommé du quota mensuel 50 GB-h).
  maxDuration: 600,

  // Retry doux : un seul retry après 30s sur les erreurs réseau.
  // Anthropic / Gemini ont parfois des hiccups (502, timeout), pas
  // la peine de retry massivement (cher) ni de fail immédiat.
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 30_000,
      maxTimeoutInMs: 60_000,
      factor: 2,
      randomize: true,
    },
  },
});
