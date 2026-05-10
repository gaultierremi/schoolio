import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Fetch the course and verify it has a PDF
    const { data: course } = await admin
      .from("courses")
      .select("id, pdf_storage_path")
      .eq("id", params.id)
      .maybeSingle();

    if (!course?.pdf_storage_path) {
      return NextResponse.json({ error: "Cours introuvable ou sans PDF" }, { status: 404 });
    }

    // Authz via the assignment chain: the student must have an active
    // membership in a class that has been assigned this specific course.
    //
    // The previous check (membership in any class taught by course.teacher_id)
    // let any student of teacher T read every PDF T has ever uploaded -
    // including drafts, other classes, private prep material - by guessing
    // course UUIDs. Reported in audit (CRITICAL).
    const { data: memberships } = await admin
      .from("class_memberships")
      .select("class_id")
      .eq("student_user_id", user.id)
      .eq("status", "active");

    const classIds = (memberships ?? []).map((m) => m.class_id);
    if (classIds.length === 0) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { count: assignmentCount } = await admin
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("resource_id", course.id)
      .in("class_id", classIds)
      .is("archived_at", null);

    if (!assignmentCount) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const TTL = 3600;
    const { data: signedData, error: signedError } = await admin.storage
      .from("course-pdfs")
      .createSignedUrl(course.pdf_storage_path, TTL);

    if (signedError || !signedData) {
      return NextResponse.json({ error: "Impossible de générer le lien" }, { status: 500 });
    }

    return NextResponse.json({
      url: signedData.signedUrl,
      expiresAt: new Date(Date.now() + TTL * 1000).toISOString(),
    });
  } catch (err) {
    console.error("[student/courses/pdf-url:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
