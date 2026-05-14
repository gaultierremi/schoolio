import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

export type ErrorContext = {
  /**
   * Stable identifier of where the error happened — used for grouping in
   * queries. Examples : "orchestrator.runIngestion",
   * "api.ingestion.trigger.POST", "lib.pdf.extract-markdown".
   */
  source: string;
  severity?: "debug" | "info" | "warn" | "error" | "fatal";
  context?: Record<string, unknown>;
  userId?: string | null;
  schoolId?: string | null;
};

function adminClient() {
  // Trigger.dev cloud runtime = Node 21, sans WebSocket natif. Le SDK Supabase
  // initialise RealtimeClient au boot → throw. Polyfill `ws` requis ici aussi
  // (cf. lib/generate-questions/runner.ts pour le même fix).
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transport: WebSocket as any,
      },
    },
  );
}

/**
 * Record an error in public.error_logs with full stack + structured context.
 *
 * Best-effort : if the log itself fails (DB down, etc.) we console.error and
 * move on — never let observability break the caller. Errors swallowed here
 * still surface in Vercel's runtime logs as a fallback.
 *
 * Usage at a route's catch block :
 *
 *   try {
 *     // ... work
 *   } catch (err) {
 *     await logError(err, {
 *       source: "api.ingestion.trigger.POST",
 *       context: { jobId, programId },
 *       userId: user.id,
 *       schoolId,
 *     });
 *     return safeError(err, "ingestion:trigger");
 *   }
 *
 * Usage in a background job (orchestrator setStatus failed) : same pattern,
 * just pass `source: "orchestrator.runIngestion"` and include jobId in context.
 */
export async function logError(
  err: unknown,
  meta: ErrorContext,
): Promise<void> {
  try {
    const error = err as Error;
    const message =
      typeof error?.message === "string" ? error.message.slice(0, 8000) : String(err).slice(0, 8000);
    const stack = typeof error?.stack === "string" ? error.stack.slice(0, 32000) : null;

    await adminClient().from("error_logs").insert({
      severity: meta.severity ?? "error",
      source: meta.source.slice(0, 100),
      message,
      stack,
      context: meta.context ?? {},
      user_id: meta.userId ?? null,
      school_id: meta.schoolId ?? null,
    });
  } catch (logErr) {
    // Never let logging fail the caller — swallow + console
    // (Vercel runtime logs will still capture this fallback).
    // eslint-disable-next-line no-console
    console.error("[logError] failed to record error", logErr, "original:", err);
  }
}
