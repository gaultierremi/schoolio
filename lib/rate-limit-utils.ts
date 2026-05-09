import { GoogleGenerativeAIFetchError } from "@google/generative-ai";

/**
 * Détecte les erreurs de rate-limit Gemini (status 429) et Anthropic (message pattern).
 * Centralisé ici pour éviter la duplication dans chaque route API IA.
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof GoogleGenerativeAIFetchError && error.status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || /rate.?limit|quota|resource.?exhausted/i.test(message);
}
