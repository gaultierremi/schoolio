import { NextRequest } from "next/server";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase-server";
import { requireSchoolMembership } from "@/lib/tenant";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { runIngestion } from "@/lib/ingestion/orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f-]{36}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
// storagePath shape: {school_id}/{program_id}/{sha-prefix}-{filename}
// school_id and program_id are UUIDs (36 chars with dashes); filename is sanitized ASCII
const PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-zA-Z0-9._-]+$/;

function admin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    // Rule 4: auth check is the FIRST instruction
    const auth = await requireTeacher();
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const supabase = createClient();
    const schoolId = await requireSchoolMembership(supabase);

    const body = (await req.json()) as {
      programId?: unknown;
      pdfStoragePath?: unknown;
      pdfSha256?: unknown;
      fast?: unknown;
    };

    // Rule 7: validate every field with correct types and patterns
    if (typeof body.programId !== "string" || !UUID_RE.test(body.programId)) {
      return apiError("programId invalide", 400);
    }
    if (typeof body.pdfStoragePath !== "string" || !PATH_RE.test(body.pdfStoragePath)) {
      return apiError("pdfStoragePath invalide", 400);
    }
    if (typeof body.pdfSha256 !== "string" || !SHA256_RE.test(body.pdfSha256)) {
      return apiError("pdfSha256 invalide", 400);
    }
    const fast = body.fast === true;

    // Verify the storage path belongs to the auth'd school (defense against path injection).
    // Rule 5: never trust body — cross-check against server-side schoolId
    if (!body.pdfStoragePath.startsWith(`${schoolId}/`)) {
      return apiError("Accès refusé au chemin de stockage", 403);
    }

    // Insert the job row via service role (RLS blocks writes from authenticated role).
    const { data: job, error: insErr } = await admin()
      .from("ingestion_jobs")
      .insert({
        school_id: schoolId,
        program_id: body.programId,
        pdf_storage_path: body.pdfStoragePath,
        pdf_sha256: body.pdfSha256,
        status: "pending",
        triggered_by: user.id,
      })
      .select("id")
      .single();

    if (insErr || !job) {
      return apiError(`Création du job échouée : ${insErr?.message ?? "no rows"}`, 500);
    }

    // Kick off the orchestrator — DON'T await. The route handler returns immediately
    // with the jobId; the status page polls /api/ingestion/[jobId] for progress.
    // The orchestrator's batch-polling loop will be killed when the Vercel function
    // times out at 60s; the batch continues on Anthropic's side.
    void runIngestion(job.id, { fast }).catch((err) => {
      console.error(`[/api/ingestion/trigger] runIngestion ${job.id} failed:`, err);
    });

    return apiOk({ jobId: job.id });
  } catch (err) {
    return safeError(err, "ingestion:trigger");
  }
}
