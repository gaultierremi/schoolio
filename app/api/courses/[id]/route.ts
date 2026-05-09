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

async function requireCourseOwnership(courseId: string, userId: string) {
  const admin = createAdminClient();
  const { data: course, error } = await admin
    .from("courses")
    .select("id, teacher_id, pdf_storage_path")
    .eq("id", courseId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!course) return { response: NextResponse.json({ error: "Cours introuvable" }, { status: 404 }) };

  const typed = course as CourseRow;
  if (typed.teacher_id !== userId) {
    return { response: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) };
  }

  return { course: typed, admin };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) return NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 });
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();
    const { data: course, error } = await admin
      .from("courses")
      .select("id, title, subject_enum, level, pdf_storage_path, teacher_id, pages_count")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!course) return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });

    return NextResponse.json(course);
  } catch (error) {
    console.error("[courses/[id] GET]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
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
      console.error("[courses/[id] DELETE]", userError);
      return NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 });
    }
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher, error: teacherError } = await supabase.rpc(
      "is_current_user_school_teacher"
    );
    if (teacherError) {
      console.error("[courses/[id] DELETE]", teacherError);
      return NextResponse.json({ error: "Erreur de vérification professeur" }, { status: 500 });
    }
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const owned = await requireCourseOwnership(params.id, user.id);
    if ("response" in owned) return owned.response;

    const { course, admin } = owned;

    const { error: deleteError } = await admin
      .from("courses")
      .delete()
      .eq("id", course.id);

    if (deleteError) throw deleteError;

    if (course.pdf_storage_path) {
      const { error: storageError } = await admin.storage
        .from("course-pdfs")
        .remove([course.pdf_storage_path]);
      if (storageError) {
        console.error("[courses/[id] DELETE] storage (non-fatal)", storageError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[courses/[id] DELETE]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
