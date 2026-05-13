import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { requireSchoolMembership } from "@/lib/tenant";
import UploadClient from "./UploadClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ajouter un syllabus · Maïa",
};

export type Program = {
  id: string;
  display_name: string;
  level: string;
  subject: string;
  program_version: string;
  country: string;
  region: string | null;
};

export type SyllabusRow = {
  jobId: string;
  filename: string;            // derived from pdf_storage_path tail
  programName: string;
  status: "pending" | "extracting" | "chunking" | "batching" | "storing" | "done" | "failed";
  triggeredAt: string;
  completedAt: string | null;
  pageCount: number | null;
  theoryBlocksCount: number;
  errorMessage: string | null;
};

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function SyllabusUploadPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Rule 3: read role from app_metadata (service-role-writable only)
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  if (appMeta.role !== "teacher" && appMeta.role !== "admin") {
    // Fall back to RPC check — same as other school pages
    const { data: isTeacher } = await supabase.rpc(
      "is_current_user_school_teacher",
    );
    if (!isTeacher) redirect("/student");
  }

  const schoolId = await requireSchoolMembership(supabase);

  const [{ data: programs }, { data: jobs }] = await Promise.all([
    admin()
      .from("curriculum_programs")
      .select(
        "id, display_name, level, subject, program_version, country, region",
      )
      .order("display_name"),
    admin()
      .from("ingestion_jobs")
      .select(
        "id, status, pdf_storage_path, triggered_at, completed_at, error_message, metadata, program_id",
      )
      .eq("school_id", schoolId)
      .order("triggered_at", { ascending: false })
      .limit(50),
  ]);

  // Build program name lookup
  const programNameById = new Map<string, string>();
  for (const p of programs ?? []) programNameById.set(p.id, p.display_name);

  // Count theory_blocks per job (one query, group in JS)
  let theoryBlocksByJob = new Map<string, number>();
  if (jobs && jobs.length > 0) {
    const { data: tbRows } = await admin()
      .from("theory_blocks")
      .select("ingestion_job_id")
      .in("ingestion_job_id", jobs.map((j) => j.id));
    if (tbRows) {
      for (const r of tbRows) {
        const id = r.ingestion_job_id as string;
        theoryBlocksByJob.set(id, (theoryBlocksByJob.get(id) ?? 0) + 1);
      }
    }
  }

  const syllabusRows: SyllabusRow[] = (jobs ?? []).map((j) => {
    const metadata = (j.metadata ?? {}) as Record<string, unknown>;
    const pathParts = j.pdf_storage_path.split("/");
    const tail = pathParts[pathParts.length - 1] ?? j.pdf_storage_path;
    // Strip the sha-prefix (16-hex-) from the tail to show the original filename
    const filename = tail.replace(/^[0-9a-f]{16}-/, "");
    return {
      jobId: j.id,
      filename,
      programName: programNameById.get(j.program_id) ?? "—",
      status: j.status as SyllabusRow["status"],
      triggeredAt: j.triggered_at,
      completedAt: j.completed_at,
      pageCount:
        typeof metadata.page_count === "number" ? metadata.page_count : null,
      theoryBlocksCount: theoryBlocksByJob.get(j.id) ?? 0,
      errorMessage: j.error_message,
    };
  });

  return (
    <UploadClient
      programs={(programs ?? []) as Program[]}
      schoolId={schoolId}
      syllabi={syllabusRows}
    />
  );
}
