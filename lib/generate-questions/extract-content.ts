// lib/generate-questions/extract-content.ts
//
// Facade publique du pipeline d'extraction de questions.
//
// Pivot 2026-05-14 : extraction TEXTE locale via pdfjs-dist (~1s pour 176 pages),
// puis Sonnet text-only par chapter (~15-30s par appel).
//
// Refactor PR 3 pipeline B (2026-05-15) :
// - La logique de pipeline A a été extraite dans run-text-pipeline.ts
// - L'orchestrateur léger (load job + PDF + dispatch) vit dans orchestrator.ts
// - Ce fichier reste la façade publique pour backward compat des imports existants :
//   - app/api/courses/generate-questions/route.ts → MAX_QUESTIONS_PER_COURSE, autoTargetQuestions
//   - trigger/generate-questions.ts → runExtractionForJob

import { runOrchestrator } from "./orchestrator";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_QUESTIONS_PER_COURSE = 600;

export function autoTargetQuestions(pagesCount: number | null): number {
  if (!pagesCount || pagesCount < 1) return 30;
  return Math.min(300, Math.ceil(pagesCount * 3));
}

/**
 * Point d'entrée public : exécute la pipeline d'extraction pour un job déjà créé en DB.
 * Délègue à runOrchestrator qui charge le job + course, extrait le texte du PDF,
 * et dispatche runTextPipeline (pipeline A) — et bientôt runImagePipeline (pipeline B, PR 4).
 *
 * Ne throw jamais — le statut DB est la seule source of truth côté UI.
 */
export async function runExtractionForJob(jobId: string): Promise<void> {
  return runOrchestrator(jobId);
}
