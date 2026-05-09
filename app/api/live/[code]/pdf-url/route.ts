import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const PDF_TTL_SECONDS = 4 * 3600;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET → public signed URL for PDF (slave page, 4h TTL, service role)
export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const admin = createAdminClient();

    const { data: session, error: sessionError } = await admin
      .from("live_sessions")
      .select("id, course_id, ended_at")
      .eq("code", params.code.toUpperCase())
      .is("ended_at", null)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) return NextResponse.json({ error: "Session introuvable ou terminée" }, { status: 404 });

    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("pdf_storage_path")
      .eq("id", session.course_id)
      .maybeSingle();

    if (courseError) throw courseError;
    if (!course?.pdf_storage_path) {
      return NextResponse.json({ error: "Aucun PDF pour ce cours" }, { status: 400 });
    }

    const { data: signedData, error: signedError } = await admin.storage
      .from("course-pdfs")
      .createSignedUrl(course.pdf_storage_path, PDF_TTL_SECONDS);

    if (signedError || !signedData) {
      console.error("[live/[code]/pdf-url:GET]", signedError);
      return NextResponse.json({ error: "Impossible de générer le lien signé" }, { status: 500 });
    }

    return NextResponse.json({
      url: signedData.signedUrl,
      expiresAt: new Date(Date.now() + PDF_TTL_SECONDS * 1000).toISOString(),
    });
  } catch (err) {
    console.error("[live/[code]/pdf-url:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
