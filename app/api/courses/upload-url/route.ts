import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

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
};

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

    const { filename, fileSize, fileHash } = body as {
      filename?: unknown;
      fileSize?: unknown;
      fileHash?: unknown;
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

    const admin = createAdminClient();

    // ── Anti-doublon (cache communautaire) ────────────────────────────────────
    const { data: existingCourse, error: hashError } = await admin
      .from("courses")
      .select("id, teacher_id, title, subject_enum, level, pages_count, pdf_hash, pdf_storage_path, pdf_size_bytes")
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

      const inference = {
        subject: found.subject_enum ?? "autre",
        level: found.level ?? null,
        title: found.title ?? "Cours sans titre",
        confidence: 100,
      };

      // ── Même enseignant : retourne les infos du cours existant directement ──
      if (found.teacher_id === user.id) {
        return NextResponse.json({ reused: true, courseId: found.id, inference });
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
        subject_enum: found.subject_enum,
        level: found.level,
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
          is_ai_generated: q.is_ai_generated,
          is_public: false,
        }));
        const { error: qInsertError } = await admin.from("teacher_questions").insert(rows);
        if (qInsertError) {
          console.error("[courses/upload-url] copy questions (non-fatal)", qInsertError);
        }
      }

      return NextResponse.json({ reused: true, courseId: newCourseId, inference });
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
        title,
        pdf_hash: fileHash,
        pdf_size_bytes: fileSize,
        pdf_storage_path: storagePath,
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
      cached: false,
      courseId,
      uploadUrl: signedData.signedUrl,
      storagePath: signedData.path,
    });
  } catch (error) {
    console.error("[courses/upload-url]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
