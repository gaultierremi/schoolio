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
      .select("id, title, subject_enum, level, pages_count")
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
      return NextResponse.json({ cached: true, existingCourse });
    }

    // ── Création du record course ─────────────────────────────────────────────
    const title = filename.replace(/\.pdf$/i, "");

    const { data: newCourse, error: insertError } = await admin
      .from("courses")
      .insert({
        teacher_id: user.id,
        title,
        pdf_hash: fileHash,
        pdf_size_bytes: fileSize,
      })
      .select("id")
      .single();

    if (insertError || !newCourse) {
      console.error("[courses/upload-url]", insertError);
      return NextResponse.json(
        { error: "Erreur lors de la création du cours" },
        { status: 500 }
      );
    }

    const courseId: string = newCourse.id;

    // ── Génération du signed URL ──────────────────────────────────────────────
    const storagePath = `${user.id}/${courseId}/${filename}`;

    const { data: signedData, error: storageError } = await admin.storage
      .from("course-pdfs")
      .createSignedUploadUrl(storagePath);

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
