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

/**
 * Détecte « ce modèle n'existe plus / n'est pas disponible » : 404 (Gemini
 * « no longer available », Anthropic not_found_error) ou 400 qui parle du
 * modèle. Une chaîne de fallback doit passer au modèle suivant exactement
 * comme sur un 429 — un modèle retiré par le fournisseur n'est pas une erreur
 * fatale de la requête (log prod 2026-09-14 : gemini-2.5-pro retiré → 500).
 */
export function isModelUnavailableError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 404) return true;
  if (status === 400 && /model/i.test(message)) return true;
  return /no longer available|is not found for API version|not found for api|does not exist|model .*not (found|supported)|not_found_error/i.test(message);
}
