import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f-]{36}$/i;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type CourseRow = {
  id: string;
  teacher_id: string;
  pdf_storage_path: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("[courses/reupload]", userError);
      return NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: isTeacher, error: teacherError } = await supabase.rpc(
      "is_current_user_school_teacher"
    );

    if (teacherError) {
      console.error("[courses/reupload]", teacherError);
      return NextResponse.json({ error: "Erreur de vérification professeur" }, { status: 500 });
    }

    if (isTeacher !== true) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    const { courseId } = body as { courseId?: unknown };

    if (typeof courseId !== "string" || !UUID_REGEX.test(courseId)) {
      return NextResponse.json({ error: "courseId invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id, teacher_id, pdf_storage_path")
      .eq("id", courseId)
      .limit(1)
      .maybeSingle();

    if (courseError) throw courseError;

    if (!course) {
      return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });
    }

    const typedCourse = course as CourseRow;

    if (typedCourse.teacher_id !== user.id) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    if (!typedCourse.pdf_storage_path) {
      return NextResponse.json({ error: "Aucun chemin de stockage associé à ce cours" }, { status: 400 });
    }

    const { data: signedData, error: storageError } = await admin.storage
      .from("course-pdfs")
      .createSignedUploadUrl(typedCourse.pdf_storage_path, { upsert: true });

    if (storageError || !signedData) {
      console.error("[courses/reupload]", storageError);
      return NextResponse.json(
        { error: "Erreur lors de la génération du signed URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      uploadUrl: signedData.signedUrl,
      storagePath: signedData.path,
    });
  } catch (error) {
    console.error("[courses/reupload]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
