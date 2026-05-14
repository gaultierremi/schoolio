import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f-]{36}$/i;

const VALID_SUBJECT_ENUMS = [
  "chimie",
  "physique",
  "biologie",
  "mathematiques",
  "histoire",
  "geographie",
  "francais",
  "anglais",
  "neerlandais",
  "autre",
] as const;

type CourseSubjectEnum = (typeof VALID_SUBJECT_ENUMS)[number];

function isValidSubjectEnum(value: unknown): value is CourseSubjectEnum {
  return typeof value === "string" && (VALID_SUBJECT_ENUMS as readonly string[]).includes(value);
}

function isValidLevel(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;
}

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type CachedCourseRow = {
  id: string;
  teacher_id: string;
  title: string | null;
  subject_enum: string | null;
  level: number | null;
  pages_count: number | null;
  pdf_hash: string | null;
  pdf_storage_path: string | null;
  pdf_size_bytes: number | null;
  organization_tags: string[] | null;
};

function parseOrganizationTags(value: unknown) {
  if (value === undefined) return { tags: [] as string[] };

  if (!Array.isArray(value) || !value.every((tag) => typeof tag === "string")) {
    return { error: "organization_tags invalide" };
  }

  const tags = Array.from(new Set(value));
  if (!tags.every((tag) => UUID_REGEX.test(tag))) {
    return { error: "organization_tags invalide" };
  }

  return { tags };
}

async function filterOwnedOrganizationTags(
  admin: ReturnType<typeof createAdminClient>,
  teacherId: string,
  tagIds: string[]
) {
  if (tagIds.length === 0) return [];

  const { data, error } = await admin
    .from("teacher_organization_tags")
    .select("id")
    .eq("teacher_id", teacherId)
    .in("id", tagIds);

  if (error) throw error;

  const ownedIds = new Set((data ?? []).map((tag) => tag.id as string));
  return tagIds.filter((tagId) => ownedIds.has(tagId));
}

function mergeOrganizationTags(currentTags: string[] | null | undefined, newTags: string[]) {
  return Array.from(new Set([...(currentTags ?? []), ...newTags]));
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("[courses/upload-url]", userError);
      return NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: isTeacher, error: teacherError } = await supabase.rpc(
      "is_current_user_school_teacher"
    );

    if (teacherError) {
      console.error("[courses/upload-url]", teacherError);
      return NextResponse.json({ error: "Erreur de vérification professeur" }, { status: 500 });
    }

    if (isTeacher !== true) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // ── Body ──────────────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    const { filename, fileSize, fileHash, organization_tags, subject_enum, level } = body as {
      filename?: unknown;
      fileSize?: unknown;
      fileHash?: unknown;
      organization_tags?: unknown;
      subject_enum?: unknown;
      level?: unknown;
    };

    // ── Validation ────────────────────────────────────────────────────────────
    if (
      typeof filename !== "string" ||
      !filename.trim() ||
      !filename.toLowerCase().endsWith(".pdf")
    ) {
      return NextResponse.json(
        { error: "filename invalide — doit être une chaîne non vide se terminant par .pdf" },
        { status: 400 }
      );
    }

    if (
      typeof fileSize !== "number" ||
      fileSize <= 0 ||
      fileSize > 52428800
    ) {
      return NextResponse.json(
        { error: "fileSize invalide — doit être entre 1 et 52428800 bytes (50 MB)" },
        { status: 400 }
      );
    }

    if (typeof fileHash !== "string" || fileHash.length !== 64) {
      return NextResponse.json(
        { error: "fileHash invalide — doit être un SHA-256 hex de 64 caractères" },
        { status: 400 }
      );
    }

    // ── subject_enum + level : optionnels mais privilégiés (choix utilisateur upfront).
    //    Si fournis, ils SONT la source de vérité — l'AI inference (infer-metadata)
    //    ne doit plus les écraser (cf. user_subject_locked / user_level_locked).
    const userSubjectEnum: CourseSubjectEnum | null =
      subject_enum === undefined || subject_enum === null
        ? null
        : isValidSubjectEnum(subject_enum)
          ? subject_enum
          : null;
    if (subject_enum !== undefined && subject_enum !== null && userSubjectEnum === null) {
      return NextResponse.json(
        { error: "subject_enum invalide" },
        { status: 400 }
      );
    }

    const userLevel: number | null =
      level === undefined || level === null
        ? null
        : isValidLevel(level)
          ? level
          : null;
    if (level !== undefined && level !== null && userLevel === null) {
      return NextResponse.json(
        { error: "level invalide — doit être un entier entre 1 et 6" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // courses.school_id devenu NOT NULL via migration multi-tenant
    // (20260513140100 + 20260513160000_seed_foundertestground). Le route
    // handler ne l'incluait pas dans l'insert — root cause "Erreur lors de
    // la création du cours" sur /school/import.
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    const schoolId = (profile?.school_id as string | null | undefined) ?? null;
    if (!schoolId) {
      return NextResponse.json({ error: "Aucune école associée à ton compte" }, { status: 403 });
    }

    const parsedOrganizationTags = parseOrganizationTags(organization_tags);
    if ("error" in parsedOrganizationTags) {
      return NextResponse.json({ error: parsedOrganizationTags.error }, { status: 400 });
    }

    const ownedOrganizationTags = await filterOwnedOrganizationTags(
      admin,
      user.id,
      parsedOrganizationTags.tags
    );

    // ── Anti-doublon (cache communautaire) ────────────────────────────────────
    const { data: existingCourse, error: hashError } = await admin
      .from("courses")
      .select("id, teacher_id, title, subject_enum, level, pages_count, pdf_hash, pdf_storage_path, pdf_size_bytes, organization_tags")
      .eq("pdf_hash", fileHash)
      .limit(1)
      .maybeSingle();

    if (hashError) {
      console.error("[courses/upload-url]", hashError);
      return NextResponse.json(
        { error: "Erreur lors de la vérification du hash" },
        { status: 500 }
      );
    }

    if (existingCourse) {
      const found = existingCourse as CachedCourseRow;

      // User upfront choice wins over cached values (le prof sait mieux).
      const effectiveSubject = userSubjectEnum ?? found.subject_enum ?? "autre";
      const effectiveLevel = userLevel ?? found.level ?? null;

      const inference = {
        subject: effectiveSubject,
        level: effectiveLevel,
        title: found.title ?? "Cours sans titre",
        confidence: 100,
      };

      // ── Même enseignant : retourne les infos du cours existant directement ──
      if (found.teacher_id === user.id) {
        const mergedOrganizationTags = mergeOrganizationTags(
          found.organization_tags,
          ownedOrganizationTags
        );

        const courseUpdate: Record<string, unknown> = {};
        if (mergedOrganizationTags.length !== (found.organization_tags ?? []).length) {
          courseUpdate.organization_tags = mergedOrganizationTags;
        }
        // Si le prof change explicitement son choix (subject ou level) en re-déposant
        // le même PDF, on met à jour le course existant. User choice wins.
        if (userSubjectEnum && userSubjectEnum !== found.subject_enum) {
          courseUpdate.subject_enum = userSubjectEnum;
        }
        if (userLevel !== null && userLevel !== found.level) {
          courseUpdate.level = userLevel;
        }

        if (Object.keys(courseUpdate).length > 0) {
          const { error: courseUpdateError } = await admin
            .from("courses")
            .update(courseUpdate)
            .eq("id", found.id);

          if (courseUpdateError) throw courseUpdateError;
        }

        return NextResponse.json({
          reused: true,
          courseId: found.id,
          inference,
          organization_tags: mergedOrganizationTags,
        });
      }

      // ── Autre enseignant : copie le cours + les questions pour cet enseignant ──
      const newCourseId = crypto.randomUUID();

      const { error: copyError } = await admin.from("courses").insert({
        id: newCourseId,
        teacher_id: user.id,
        title: found.title,
        pdf_hash: found.pdf_hash,
        pdf_storage_path: found.pdf_storage_path,
        pdf_size_bytes: found.pdf_size_bytes,
        pages_count: found.pages_count,
        // User upfront choice wins (sinon : valeurs du cache communautaire).
        subject_enum: userSubjectEnum ?? found.subject_enum,
        level: userLevel ?? found.level,
        organization_tags: ownedOrganizationTags,
      });

      if (copyError) {
        console.error("[courses/upload-url] copy course", copyError);
        return NextResponse.json({ error: "Erreur lors de la copie du cours" }, { status: 500 });
      }

      // Copie des questions — best-effort, non-bloquant
      const { data: questions, error: qFetchError } = await admin
        .from("teacher_questions")
        .select("type, question, options, answer_index, explanation, period, subject_enum, level, is_ai_generated")
        .eq("course_id", found.id);

      if (!qFetchError && questions && questions.length > 0) {
        const rows = questions.map((q) => ({
          teacher_id: user.id,
          course_id: newCourseId,
          subject: null,
          type: q.type,
          question: q.question,
          options: q.options,
          answer_index: q.answer_index,
          explanation: q.explanation,
          period: q.period,
          subject_enum: q.subject_enum,
          level: q.level,
          organization_tags: ownedOrganizationTags,
          is_ai_generated: q.is_ai_generated,
          is_public: false,
        }));
        const { error: qInsertError } = await admin.from("teacher_questions").insert(rows);
        if (qInsertError) {
          console.error("[courses/upload-url] copy questions (non-fatal)", qInsertError);
        }
      }

      return NextResponse.json({
        reused: true,
        courseId: newCourseId,
        inference,
        organization_tags: ownedOrganizationTags,
      });
    }

    // ── Création du record course ─────────────────────────────────────────────
    const title = filename.replace(/\.pdf$/i, "");
    const courseId = crypto.randomUUID();
    const storagePath = `${user.id}/${courseId}/${filename}`;

    const { error: insertError } = await admin
      .from("courses")
      .insert({
        id: courseId,
        teacher_id: user.id,
        school_id: schoolId,
        title,
        pdf_hash: fileHash,
        pdf_size_bytes: fileSize,
        pdf_storage_path: storagePath,
        organization_tags: ownedOrganizationTags,
        // ── User-selected upfront ⇒ stocké d'office. infer-metadata ne doit pas
        //    écraser ces valeurs (cf. /api/courses/infer-metadata).
        ...(userSubjectEnum ? { subject_enum: userSubjectEnum } : {}),
        ...(userLevel !== null ? { level: userLevel } : {}),
      });

    if (insertError) {
      console.error("[courses/upload-url]", insertError);
      return NextResponse.json(
        { error: "Erreur lors de la création du cours" },
        { status: 500 }
      );
    }

    // ── Génération du signed URL ──────────────────────────────────────────────

    const { data: signedData, error: storageError } = await admin.storage
      .from("course-pdfs")
      .createSignedUploadUrl(storagePath, { upsert: true });

    if (storageError || !signedData) {
      console.error("[courses/upload-url]", storageError);
      return NextResponse.json(
        { error: "Erreur lors de la génération du signed URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      reused: false,
      cached: false,
      courseId,
      uploadUrl: signedData.signedUrl,
      storagePath: signedData.path,
      organization_tags: ownedOrganizationTags,
    });
  } catch (error) {
    console.error("[courses/upload-url]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
