import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { generateExercises } from "@/lib/exercises/generate-exercises";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type CourseRow = {
  id: string;
  title: string;
  subject_enum: string | null;
  level: number | null;
  pdf_storage_path: string | null;
  teacher_id: string;
  pages_count: number | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) {
      return NextResponse.json({ error: "Accès réservé aux professeurs" }, { status: 403 });
    }

    const admin = createAdminClient();

    const { data: course, error: courseErr } = await admin
      .from("courses")
      .select("id, title, subject_enum, level, pdf_storage_path, teacher_id, pages_count")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .single();

    if (courseErr || !course) {
      return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });
    }

    const typedCourse = course as CourseRow;

    // Parse optional body — default 5 exercises, clamped to [3, 10]
    let count = 5;
    let pageRange: { start: number; end: number } | null = null;
    try {
      const body = await req.json() as { count?: unknown; page_range?: unknown };
      if (typeof body.count === "number" && Number.isFinite(body.count)) {
        count = Math.min(10, Math.max(3, Math.round(body.count)));
      }
      if (body.page_range !== null && typeof body.page_range === "object") {
        const pr = body.page_range as Record<string, unknown>;
        if (typeof pr.start === "number" && typeof pr.end === "number") {
          const start = Math.round(pr.start);
          const end = Math.round(pr.end);
          if (start >= 1 && end >= start) {
            if (typedCourse.pages_count && end > typedCourse.pages_count) {
              return NextResponse.json(
                { error: `La plage dépasse le nombre de pages du PDF (${typedCourse.pages_count})` },
                { status: 400 }
              );
            }
            pageRange = { start, end };
          }
        }
      }
    } catch {
      // body absent or not JSON — use defaults
    }

    const result = await generateExercises({
      courseId: params.id,
      teacherId: user.id,
      courseTitle: typedCourse.title,
      subject: typedCourse.subject_enum ?? null,
      level: typedCourse.level ?? null,
      pdfStoragePath: typedCourse.pdf_storage_path ?? null,
      count,
      pageRange,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[generate-exercises:POST]", err);
    if (err instanceof Error && err.message === "ALL_MODELS_RATE_LIMITED") {
      return NextResponse.json(
        { error: "Service IA temporairement saturé, réessaye dans quelques minutes." },
        { status: 503 }
      );
    }
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
