// Feature flags pilotables via env vars Vercel (reload ~30s sans redéploiement).
// Pattern : flag OFF par défaut, basculable sans code change.

export const PIPELINE_B_ENABLED = process.env.PIPELINE_B_ENABLED === "true";
