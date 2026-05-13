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

  const { data: programs } = await admin()
    .from("curriculum_programs")
    .select(
      "id, display_name, level, subject, program_version, country, region",
    )
    .order("display_name");

  return (
    <UploadClient
      programs={(programs ?? []) as Program[]}
      schoolId={schoolId}
    />
  );
}
