import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type CourseRow = {
  id: string;
  teacher_id: string;
  title: string | null;
  subject_enum: string | null;
  level: number | null;
  organization_tags: string[] | null;
  pdf_storage_path: string | null;
  pdf_size_bytes: number | null;
  created_at: string | null;
};

type QuestionCountRow = {
  course_id: string | null;
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

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("[courses]", userError);
      return NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: isTeacher, error: teacherError } = await supabase.rpc(
      "is_current_user_school_teacher"
    );

    if (teacherError) {
      console.error("[courses]", teacherError);
      return NextResponse.json({ error: "Erreur de vérification professeur" }, { status: 500 });
    }

    if (isTeacher !== true) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const admin = createAdminClient();

    const [coursesResult, questionsResult] = await Promise.all([
      admin
        .from("courses")
        .select("id, teacher_id, title, subject_enum, level, organization_tags, pdf_storage_path, pdf_size_bytes, created_at")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false }),
      admin
        .from("teacher_questions")
        .select("course_id")
        .eq("teacher_id", user.id)
        .not("course_id", "is", null),
    ]);

    if (coursesResult.error) throw coursesResult.error;
    if (questionsResult.error) throw questionsResult.error;

    const courses = (coursesResult.data ?? []) as CourseRow[];
    const questionRows = (questionsResult.data ?? []) as QuestionCountRow[];

    const countsByCourseId = new Map<string, number>();
    for (const row of questionRows) {
      if (row.course_id) {
        countsByCourseId.set(row.course_id, (countsByCourseId.get(row.course_id) ?? 0) + 1);
      }
    }

    const result = courses.map(({ teacher_id: _tid, ...course }) => ({
      ...course,
      questions_count: countsByCourseId.get(course.id) ?? 0,
    }));

    return NextResponse.json({ courses: result });
  } catch (error) {
    console.error("[courses]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
