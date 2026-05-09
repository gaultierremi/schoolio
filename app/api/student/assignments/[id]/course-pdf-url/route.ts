import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Returns a signed URL for the course PDF attached to any assignment type (pdf or quiz).
// Used by the quiz "J'ai pas compris" flow to open the theory page.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const admin = createAdminClient();

    const { data: assignment } = await admin
      .from("assignments")
      .select("id, class_id, resource_id")
      .eq("id", params.id)
      .is("archived_at", null)
      .maybeSingle();

    if (!assignment) return NextResponse.json({ error: "Devoir introuvable" }, { status: 404 });

    const { data: membership } = await admin
      .from("class_memberships")
      .select("id")
      .eq("class_id", assignment.class_id)
      .eq("student_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const { data: course } = await admin
      .from("courses")
      .select("pdf_storage_path")
      .eq("id", assignment.resource_id)
      .maybeSingle();

    if (!course?.pdf_storage_path) {
      return NextResponse.json({ error: "Aucun PDF disponible pour ce cours" }, { status: 400 });
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
    console.error("[student/course-pdf-url:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
