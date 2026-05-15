import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { requireSchoolMembership } from "@/lib/tenant";
import StatusClient from "./StatusClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ingestion en cours · Maïa",
};

function admin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function IngestionStatusPage({ params }: { params: { jobId: string } }) {
  if (!UUID_RE.test(params.jobId)) redirect("/accueil");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  if (appMeta.role !== "teacher" && appMeta.role !== "admin") redirect("/accueil");

  const schoolId = await requireSchoolMembership(supabase);

  const { data: job } = await admin()
    .from("ingestion_jobs")
    .select("id, school_id, program_id, status, triggered_at")
    .eq("id", params.jobId)
    .maybeSingle();

  if (!job) redirect("/accueil");
  if (job.school_id !== schoolId) redirect("/accueil");

  return <StatusClient jobId={params.jobId} initialStatus={job.status} programId={job.program_id} />;
}
