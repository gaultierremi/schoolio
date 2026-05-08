import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type CourseRow = {
  id: string;
  teacher_id: string;
  pdf_storage_path: string | null;
};

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur inconnue";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("[courses/[id]/signed-url]", userError);
      return NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 });
    }
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher, error: teacherError } = await supabase.rpc(
      "is_current_user_school_teacher"
    );
    if (teacherError) {
      console.error("[courses/[id]/signed-url]", teacherError);
      return NextResponse.json({ error: "Erreur de vérification professeur" }, { status: 500 });
    }
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id, teacher_id, pdf_storage_path")
      .eq("id", params.id)
      .limit(1)
      .maybeSingle();

    if (courseError) throw courseError;
    if (!course) return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });

    const typed = course as CourseRow;
    if (typed.teacher_id !== user.id) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (!typed.pdf_storage_path) {
      return NextResponse.json({ error: "Aucun PDF associé à ce cours" }, { status: 400 });
    }

    const TTL = 3600;
    const { data: signedData, error: signedError } = await admin.storage
      .from("course-pdfs")
      .createSignedUrl(typed.pdf_storage_path, TTL);

    if (signedError || !signedData) {
      console.error("[courses/[id]/signed-url]", signedError);
      return NextResponse.json({ error: "Impossible de générer le lien signé" }, { status: 500 });
    }

    return NextResponse.json({
      url: signedData.signedUrl,
      expiresAt: new Date(Date.now() + TTL * 1000).toISOString(),
    });
  } catch (error) {
    console.error("[courses/[id]/signed-url]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
