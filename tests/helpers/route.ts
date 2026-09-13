/**
 * Petits utilitaires pour appeler un route handler App Router comme le ferait
 * Next, et lire sa réponse. Les handlers acceptent un NextRequest ; une
 * Request standard suffit pour tout ce qu'ils lisent ici (méthode, body).
 */
import type { NextRequest } from "next/server";

export function makeRequest(
  method: string,
  url = "http://localhost/api/test",
  body?: unknown,
): NextRequest {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(url, init) as unknown as NextRequest;
}

export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/**
 * Vrai si toutes les valeurs (récursivement) sont des nombres — utile pour
 * affirmer qu'un payload d'erreur ne transporte aucune PII (noms, emails, ids).
 */
export function isAllNumbers(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>).every(isAllNumbers);
  }
  return false;
}
