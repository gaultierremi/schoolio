import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

type TeacherTagRow = {
  id: string;
  teacher_id: string;
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

async function requireTeacherUser() {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("[teacher-tags/usage]", userError);
    return { response: NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 }) };
  }

  if (!user) {
    return { response: NextResponse.json({ error: "Non authentifie" }, { status: 401 }) };
  }

  const { data: isTeacher, error: teacherError } = await supabase.rpc(
    "is_current_user_school_teacher"
  );

  if (teacherError) {
    console.error("[teacher-tags/usage]", teacherError);
    return { response: NextResponse.json({ error: "Erreur de verification professeur" }, { status: 500 }) };
  }

  if (isTeacher !== true) {
    return { response: NextResponse.json({ error: "Acces refuse" }, { status: 403 }) };
  }

  return { user };
}

async function getOwnedTag(
  admin: ReturnType<typeof createAdminClient>,
  tagId: string,
  teacherId: string
): Promise<TeacherTagRow | { response: NextResponse }> {
  const { data, error } = await admin
    .from("teacher_organization_tags")
    .select("id, teacher_id")
    .eq("id", tagId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return { response: NextResponse.json({ error: "Tag introuvable" }, { status: 404 }) };
  }

  const tag = data as TeacherTagRow;
  if (tag.teacher_id !== teacherId) {
    return { response: NextResponse.json({ error: "Acces refuse" }, { status: 403 }) };
  }

  return tag;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const auth = await requireTeacherUser();
    if ("response" in auth) return auth.response;

    const admin = createAdminClient();
    const tag = await getOwnedTag(admin, params.id, auth.user.id);
    if ("response" in tag) return tag.response;

    const [coursesResult, questionsResult, classesResult] = await Promise.all([
      admin
        .from("courses")
        .select("id, title, subject_enum, level")
        .eq("teacher_id", auth.user.id)
        .contains("organization_tags", [params.id])
        .order("created_at", { ascending: false }),
      admin
        .from("teacher_questions")
        .select("id, question, subject_enum")
        .eq("teacher_id", auth.user.id)
        .contains("organization_tags", [params.id])
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("classes")
        .select("id, name, level")
        .eq("teacher_id", auth.user.id)
        .contains("organization_tags", [params.id])
        .order("created_at", { ascending: false }),
    ]);

    if (coursesResult.error) throw coursesResult.error;
    if (questionsResult.error) throw questionsResult.error;
    if (classesResult.error) throw classesResult.error;

    return NextResponse.json({
      courses: coursesResult.data ?? [],
      questions: questionsResult.data ?? [],
      classes: classesResult.data ?? [],
    });
  } catch (error) {
    console.error("[teacher-tags/usage]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
