import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { apiError, safeError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

const VALID_COLORS = ["purple", "blue", "red", "orange", "green", "yellow", "pink", "gray"] as const;

type TagColor = (typeof VALID_COLORS)[number];

type TeacherTagRow = {
  id: string;
  teacher_id: string;
  name: string;
  emoji: string | null;
  color: TagColor;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type TagUsage = {
  courses: number;
  questions: number;
  classes: number;
};

type ParsedTagInput = {
  name: string;
  emoji?: string | null;
  color?: TagColor;
  description?: string | null;
};

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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
    console.error("[teacher-tags]", userError);
    return { response: NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 }) };
  }

  if (!user) {
    return { response: NextResponse.json({ error: "Non authentifie" }, { status: 401 }) };
  }

  const { data: isTeacher, error: teacherError } = await supabase.rpc(
    "is_current_user_school_teacher"
  );

  if (teacherError) {
    console.error("[teacher-tags]", teacherError);
    return { response: NextResponse.json({ error: "Erreur de verification professeur" }, { status: 500 }) };
  }

  if (isTeacher !== true) {
    return { response: NextResponse.json({ error: "Acces refuse" }, { status: 403 }) };
  }

  return { user };
}

function parseTagInput(body: unknown): { input?: ParsedTagInput; response?: NextResponse } {
  if (!isRecord(body)) {
    return { response: NextResponse.json({ error: "Body invalide" }, { status: 400 }) };
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 50) {
    return { response: NextResponse.json({ error: "Nom invalide" }, { status: 400 }) };
  }

  if (body.color !== undefined && !isTagColor(body.color)) {
    return { response: NextResponse.json({ error: "Couleur invalide" }, { status: 400 }) };
  }

  if (body.emoji !== undefined && body.emoji !== null && typeof body.emoji !== "string") {
    return { response: NextResponse.json({ error: "Emoji invalide" }, { status: 400 }) };
  }

  const emoji = typeof body.emoji === "string" ? body.emoji.trim() : body.emoji;
  if (typeof emoji === "string" && emoji.length > 8) {
    return { response: NextResponse.json({ error: "Emoji invalide" }, { status: 400 }) };
  }

  if (
    body.description !== undefined &&
    body.description !== null &&
    typeof body.description !== "string"
  ) {
    return { response: NextResponse.json({ error: "Description invalide" }, { status: 400 }) };
  }

  const description =
    typeof body.description === "string" ? body.description.trim() : body.description;
  if (typeof description === "string" && description.length > 200) {
    return { response: NextResponse.json({ error: "Description invalide" }, { status: 400 }) };
  }

  return {
    input: {
      name,
      emoji: emoji === "" ? null : emoji ?? undefined,
      color: body.color === undefined ? undefined : body.color,
      description: description === "" ? null : description ?? undefined,
    },
  };
}

async function getTagUsage(admin: ReturnType<typeof createAdminClient>, teacherId: string, tagId: string): Promise<TagUsage> {
  // Seules courses et teacher_questions portent organization_tags
  // (20260507100000:30-31). classes n'a jamais eu la colonne : la compter
  // renvoyait 42703 → 500 dès qu'un prof avait un tag. On garde la clé
  // `classes` à 0 pour ne pas changer le contrat de réponse lu par l'UI.
  const [coursesResult, questionsResult] = await Promise.all([
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
  ]);

  if (coursesResult.error) throw coursesResult.error;
  if (questionsResult.error) throw questionsResult.error;

  return {
    courses: coursesResult.count ?? 0,
    questions: questionsResult.count ?? 0,
    classes: 0,
  };
}

export async function GET() {
  try {
    const auth = await requireTeacherUser();
    if ("response" in auth) return auth.response;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("teacher_organization_tags")
      .select("*")
      .eq("teacher_id", auth.user.id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const tags = (data ?? []) as TeacherTagRow[];
    const tagsWithUsage = await Promise.all(
      tags.map(async ({ teacher_id: _teacherId, ...tag }) => ({
        ...tag,
        usage: await getTagUsage(admin, auth.user.id, tag.id),
      }))
    );

    return NextResponse.json({ tags: tagsWithUsage });
  } catch (error) {
    return safeError(error, "teacher-tags:GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireTeacherUser();
    if ("response" in auth) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Corps de requete invalide" }, { status: 400 });
    }

    const parsed = parseTagInput(body);
    if (parsed.response) return parsed.response;

    const input = parsed.input!;
    const admin = createAdminClient();

    // teacher_organization_tags.school_id est NOT NULL depuis la migration
    // multi-tenant (20260513140100 + 20260513160000:57). L'insert ne le
    // posait pas → 23502 → 500. Même correctif que app/api/classes/route.ts.
    const { data: profile } = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", auth.user.id)
      .maybeSingle();
    const schoolId = (profile as { school_id?: string | null } | null)?.school_id;
    if (!schoolId) {
      return apiError("Aucune école associée à ton compte", 403);
    }

    const { data: existingTag, error: existingError } = await admin
      .from("teacher_organization_tags")
      .select("id")
      .eq("teacher_id", auth.user.id)
      .eq("name", input.name)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingTag) {
      return NextResponse.json(
        { error: "Un tag avec ce nom existe deja" },
        { status: 409 }
      );
    }

    const { data: tag, error: insertError } = await admin
      .from("teacher_organization_tags")
      .insert({
        teacher_id: auth.user.id,
        school_id: schoolId,
        name: input.name,
        emoji: input.emoji,
        color: input.color ?? "purple",
        description: input.description,
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ tag });
  } catch (error) {
    return safeError(error, "teacher-tags:POST");
  }
}
