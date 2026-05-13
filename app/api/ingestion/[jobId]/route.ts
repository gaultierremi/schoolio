import { NextRequest } from "next/server";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase-server";
import { requireSchoolMembership } from "@/lib/tenant";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function admin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  try {
    // Rule 4: auth check is the FIRST instruction
    const auth = await requireTeacher();
    if (!auth.ok) return auth.response;

    const supabase = createClient();
    const schoolId = await requireSchoolMembership(supabase);

    // Rule 7: validate path param with UUID regex
    if (!UUID_RE.test(params.jobId)) return apiError("jobId invalide", 400);

    // Use service role so we can read the job regardless of RLS read policy
    // (which requires current_user_school_id() — consistent, but redundant here
    // since we do the school_id check ourselves below).
    const { data: job, error: jobErr } = await admin()
      .from("ingestion_jobs")
      .select(
        "id, school_id, program_id, status, started_at, completed_at, triggered_at, batch_id, error_message, metadata",
      )
      .eq("id", params.jobId)
      .maybeSingle();

    if (jobErr) return apiError(jobErr.message, 500);
    if (!job) return apiError("Job introuvable", 404);

    // Rule 5: enforce tenant isolation server-side — never trust the URL param alone
    if (job.school_id !== schoolId) return apiError("Accès refusé", 403);

    // Count theory_blocks written so far for this job (progress indicator for status page)
    const { count } = await admin()
      .from("theory_blocks")
      .select("id", { count: "exact", head: true })
      .eq("ingestion_job_id", params.jobId);

    return apiOk({
      jobId: job.id,
      status: job.status,
      programId: job.program_id,
      triggeredAt: job.triggered_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      batchId: job.batch_id,
      errorMessage: job.error_message,
      metadata: job.metadata ?? {},
      theoryBlocksCount: count ?? 0,
    });
  } catch (err) {
    return safeError(err, "ingestion:status");
  }
}
