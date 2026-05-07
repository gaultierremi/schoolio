import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const VALID_COLORS = ["purple", "blue", "red", "orange", "green", "yellow", "pink", "gray"] as const;

type RouteContext = {
  params: {
    id: string;
  };
};

type TagColor = (typeof VALID_COLORS)[number];

type TeacherTagRow = {
  id: string;
  teacher_id: string;
  name: string;
};

type TagUsage = {
  courses: number;
  questions: number;
  classes: number;
};

type TagUpdate = Partial<{
  name: string;
  emoji: string | null;
  color: TagColor;
  description: string | null;
}>;

type EntityWithTags = {
  id: string;
  organization_tags: string[] | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTagColor(value: unknown): value is TagColor {
  return typeof value === "string" && VALID_COLORS.includes(value as TagColor);
}

async function requireTeacherUser() {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("[teacher-tags/id]", userError);
    return { response: NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 }) };
  }

  if (!user) {
    return { response: NextResponse.json({ error: "Non authentifie" }, { status: 401 }) };
  }

  const { data: isTeacher, error: teacherError } = await supabase.rpc(
    "is_current_user_school_teacher"
  );

  if (teacherError) {
    console.error("[teacher-tags/id]", teacherError);
    return { response: NextResponse.json({ error: "Erreur de verification professeur" }, { status: 500 }) };
  }

  if (isTeacher !== true) {
    return { response: NextResponse.json({ error: "Acces refuse" }, { status: 403 }) };
  }

  return { user };
}

function parseTagUpdate(body: unknown): { update?: TagUpdate; response?: NextResponse } {
  if (!isRecord(body)) {
    return { response: NextResponse.json({ error: "Body invalide" }, { status: 400 }) };
  }

  const update: TagUpdate = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 50) {
      return { response: NextResponse.json({ error: "Nom invalide" }, { status: 400 }) };
    }
    update.name = name;
  }

  if (body.color !== undefined) {
    if (!isTagColor(body.color)) {
      return { response: NextResponse.json({ error: "Couleur invalide" }, { status: 400 }) };
    }
    update.color = body.color;
  }

  if (body.emoji !== undefined) {
    if (body.emoji !== null && typeof body.emoji !== "string") {
      return { response: NextResponse.json({ error: "Emoji invalide" }, { status: 400 }) };
    }

    const emoji = typeof body.emoji === "string" ? body.emoji.trim() : body.emoji;
    if (typeof emoji === "string" && emoji.length > 8) {
      return { response: NextResponse.json({ error: "Emoji invalide" }, { status: 400 }) };
    }
    update.emoji = emoji === "" ? null : emoji;
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      return { response: NextResponse.json({ error: "Description invalide" }, { status: 400 }) };
    }

    const description =
      typeof body.description === "string" ? body.description.trim() : body.description;
    if (typeof description === "string" && description.length > 200) {
      return { response: NextResponse.json({ error: "Description invalide" }, { status: 400 }) };
    }
    update.description = description === "" ? null : description;
  }

  return { update };
}

async function getOwnedTag(
  admin: ReturnType<typeof createAdminClient>,
  tagId: string,
  teacherId: string
): Promise<TeacherTagRow | { response: NextResponse }> {
  const { data, error } = await admin
    .from("teacher_organization_tags")
    .select("id, teacher_id, name")
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

async function getTagUsage(admin: ReturnType<typeof createAdminClient>, teacherId: string, tagId: string): Promise<TagUsage> {
  const [coursesResult, questionsResult, classesResult] = await Promise.all([
    admin
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId)
      .contains("organization_tags", [tagId]),
    admin
      .from("teacher_questions")
      .select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId)
      .contains("organization_tags", [tagId]),
    admin
      .from("classes")
      .select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId)
      .contains("organization_tags", [tagId]),
  ]);

  if (coursesResult.error) throw coursesResult.error;
  if (questionsResult.error) throw questionsResult.error;
  if (classesResult.error) throw classesResult.error;

  return {
    courses: coursesResult.count ?? 0,
    questions: questionsResult.count ?? 0,
    classes: classesResult.count ?? 0,
  };
}

async function removeTagReferences(
  admin: ReturnType<typeof createAdminClient>,
  table: "courses" | "teacher_questions" | "classes",
  teacherId: string,
  tagId: string
) {
  const { data, error } = await admin
    .from(table)
    .select("id, organization_tags")
    .eq("teacher_id", teacherId)
    .contains("organization_tags", [tagId]);

  if (error) throw error;

  const rows = (data ?? []) as EntityWithTags[];
  await Promise.all(
    rows.map(async (row) => {
      const nextTags = (row.organization_tags ?? []).filter((id) => id !== tagId);
      const { error: updateError } = await admin
        .from(table)
        .update({ organization_tags: nextTags })
        .eq("id", row.id);

      if (updateError) throw updateError;
    })
  );

  return rows.length;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireTeacherUser();
    if ("response" in auth) return auth.response;

    const admin = createAdminClient();
    const tag = await getOwnedTag(admin, params.id, auth.user.id);
    if ("response" in tag) return tag.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Corps de requete invalide" }, { status: 400 });
    }

    const parsed = parseTagUpdate(body);
    if (parsed.response) return parsed.response;

    const update = parsed.update ?? {};
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Aucun champ a mettre a jour" }, { status: 400 });
    }

    if (update.name !== undefined && update.name !== tag.name) {
      const { data: existingTag, error: existingError } = await admin
        .from("teacher_organization_tags")
        .select("id")
        .eq("teacher_id", auth.user.id)
        .eq("name", update.name)
        .neq("id", params.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existingTag) {
        return NextResponse.json(
          { error: "Un tag avec ce nom existe deja" },
          { status: 409 }
        );
      }
    }

    const { data: updatedTag, error: updateError } = await admin
      .from("teacher_organization_tags")
      .update(update)
      .eq("id", params.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ tag: updatedTag });
  } catch (error) {
    console.error("[teacher-tags/id]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireTeacherUser();
    if ("response" in auth) return auth.response;

    const admin = createAdminClient();
    const tag = await getOwnedTag(admin, params.id, auth.user.id);
    if ("response" in tag) return tag.response;

    const usage = await getTagUsage(admin, auth.user.id, params.id);
    const totalUsage = usage.courses + usage.questions + usage.classes;
    const force = request.nextUrl.searchParams.get("force") === "true";

    if (totalUsage > 0 && !force) {
      return NextResponse.json({ error: "Tag utilise", usage }, { status: 409 });
    }

    let cleaned: TagUsage | undefined;
    if (force) {
      const [courses, questions, classes] = await Promise.all([
        removeTagReferences(admin, "courses", auth.user.id, params.id),
        removeTagReferences(admin, "teacher_questions", auth.user.id, params.id),
        removeTagReferences(admin, "classes", auth.user.id, params.id),
      ]);
      cleaned = { courses, questions, classes };
    }

    const { error: deleteError } = await admin
      .from("teacher_organization_tags")
      .delete()
      .eq("id", params.id);

    if (deleteError) throw deleteError;

    return NextResponse.json(cleaned ? { success: true, cleaned } : { success: true });
  } catch (error) {
    console.error("[teacher-tags/id]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
