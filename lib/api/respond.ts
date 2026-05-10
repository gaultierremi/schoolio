import { NextResponse } from "next/server";

export function apiError(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function safeError(error: unknown, logTag: string, fallback = "Erreur serveur", status = 500): NextResponse {
  console.error(`[${logTag}]`, error);
  return apiError(fallback, status);
}
