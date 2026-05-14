import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase-server";
import { requireSchoolMembership } from "@/lib/tenant";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { runIngestion } from "@/lib/ingestion/orchestrator";
import { logError } from "@/lib/observability/log-error";

export const dynamic = "force-dynamic";
// Mirror trigger's maxDuration — the resumed run may itself take up to 5 min.
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f-]{36}$/i;

// Statuses that are considered "genuinely terminal" — nothing to resume.
const TERMINAL_STATUSES = ["done", "failed"] as const;
type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

// In-flight statuses: orphaned by a prior Vercel timeout — safe to re-trigger.
// pending is also safe (race-free for dogfood scale; see TODO below).
const RESUMABLE_STATUSES = [
  "pending",
  "extracting",
  "chunking",
  "batching",
  "storing",
] as const;

function admin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  try {
    // Rule 4: auth check FIRST
    const auth = await requireTeacher();
    if (!auth.ok) return auth.response;

    const supabase = createClient();
    const schoolId = await requireSchoolMembership(supabase);

    // Rule 7: validate path param
    if (!UUID_RE.test(params.jobId)) return apiError("jobId invalide", 400);

    // Rule 7: validate optional body field
    let fast = false;
    try {
      const body = (await req.json().catch(() => ({}))) as { fast?: unknown };
      fast = body.fast === true;
    } catch {
      // body is optional — default fast=false
    }

    // Fetch the job via service role to read across RLS
    const { data: job, error: jobErr } = await admin()
      .from("ingestion_jobs")
      .select("id, school_id, status")
      .eq("id", params.jobId)
      .maybeSingle();

    if (jobErr) return safeError(jobErr, "ingestion:resume:fetch");
    if (!job) return apiError("Job introuvable", 404);

    // Rule 5: enforce tenant isolation — never trust URL param alone
    if (job.school_id !== schoolId) return apiError("Accès refusé", 403);

    // Terminal check: done or failed → nothing to resume
    if ((TERMINAL_STATUSES as readonly string[]).includes(job.status)) {
      return apiError(
        `Le job est déjà terminé (status: ${job.status}). Rien à reprendre.`,
        400,
      );
    }

    // Sanity: reject any unexpected status that isn't in our resumable set
    if (!(RESUMABLE_STATUSES as readonly string[]).includes(job.status)) {
      return apiError(`Status inconnu : ${job.status}`, 400);
    }

    // TODO (Sprint 2 multi-tenant): add a distributed lock (e.g. Supabase advisory
    // lock or an `is_running` boolean with optimistic update) to detect a genuinely
    // in-flight job and avoid stomping it. For dogfood scale, overwriting a zombie
    // job is acceptable — runIngestion is idempotent (upsert on slug / ordinal).

    // Re-trigger the pipeline in the background; return immediately.
    waitUntil(
      runIngestion(job.id, { fast }).catch((err) => {
        console.error(
          `[/api/ingestion/${job.id}/resume] runIngestion failed:`,
          err,
        );
      }),
    );

    return apiOk({ jobId: job.id, resumed: true });
  } catch (err) {
    await logError(err, {
      source: "api.ingestion.resume.POST",
      context: { route: `/api/ingestion/${params.jobId}/resume` },
    });
    return safeError(err, "ingestion:resume");
  }
}
