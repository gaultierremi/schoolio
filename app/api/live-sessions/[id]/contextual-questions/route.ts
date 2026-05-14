import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { getContextualQuestions, generateLiveQuestions, type ContextualQuestion } from "@/lib/contextual-questions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_REGEX = /^[0-9a-f-]{36}$/i;
const MAX_PDF_BYTES = 52428800;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET ?page=5&generate=true → return validated questions near current page,
// optionally triggering AI generation for the current page slice
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: "sessionId invalide" }, { status: 400 });
    }

    const url = new URL(req.url);
    const pageParam = url.searchParams.get("page");
    const shouldGenerate = url.searchParams.get("generate") === "true";

    const admin = createAdminClient();

    const { data: session } = await admin
      .from("live_sessions")
      .select("id, teacher_id, course_id, current_page, ended_at")
      .eq("id", params.id)
      .maybeSingle();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (session.teacher_id !== user.id) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (session.ended_at) return NextResponse.json({ error: "Session terminée" }, { status: 410 });

    const currentPage = pageParam ? Math.max(1, parseInt(pageParam, 10)) : (session.current_page as number);
    const courseId = session.course_id as string;

    const existing = await getContextualQuestions(admin, courseId, currentPage);
    let aiGenerated: ContextualQuestion[] = [];

    if (shouldGenerate) {
      const { data: course } = await admin
        .from("courses")
        .select("pdf_storage_path")
        .eq("id", courseId)
        .maybeSingle();

      const pdfPath = course?.pdf_storage_path as string | null;
      if (pdfPath) {
        const { data: pdfBlob } = await admin.storage.from("course-pdfs").download(pdfPath);
        if (pdfBlob) {
          const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
          if (pdfBuffer.byteLength <= MAX_PDF_BYTES) {
            // Legacy route: cockpit POC uses /api/feat/cockpit/sessions/[code]/contextual-questions
            aiGenerated = await generateLiveQuestions(
              admin,
              user.id,
              courseId,
              currentPage,
              "demo-1", // pdfKey placeholder — live_sessions not used in cockpit POC
              "",       // transcript placeholder
            );
          }
        }
      }
    }

    return NextResponse.json({
      questions: [...aiGenerated, ...existing],
      ai_generated_count: aiGenerated.length,
      current_page: currentPage,
    });
  } catch (err) {
    console.error("[live-sessions/[id]/contextual-questions:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
