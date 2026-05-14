// POST /api/courses/generate-questions
// ─────────────────────────────────────────────────────────────────────────────
// Valide la requête (auth prof, plafond 600q/cours), crée une row dans
// `question_generation_jobs`, et déclenche la task Trigger.dev qui exécute
// le heavy lifting (download PDF, workers Anthropic, normalize, INSERT).
//
// Avant : waitUntil(runGeneration()) en background Vercel. Jobs longs étaient
// killés silencieusement → questions stuck à 0 sans error log capturable.
// Après : tasks.trigger("generate-questions", { jobId }) → run en cloud
// Trigger.dev, hors fenêtre Vercel, sans risque de kill mid-execution.
//
// Le client continue à poller GET /api/courses/generate-questions/[jobId]/status
// toutes les 2s pour afficher progress (phases + workers_completed + ETA).

import { NextRequest, NextResponse } from "next/server";
import { GracefulAIError } from "@/lib/ai-router";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { logError } from "@/lib/observability/log-error";
import { tasks } from "@trigger.dev/sdk/v3";
import { MAX_QUESTIONS_PER_COURSE, autoTargetQuestions } from "@/lib/generate-questions/extract-content";
import type { generateQuestionsTask } from "@/trigger/generate-questions";

export const dynamic = "force-dynamic";
// Route serverless juste pour validation + insert job + trigger.
// 30s suffisent — le heavy lifting est offload sur Trigger.dev.
export const maxDuration = 30;

const UUID_REGEX = /^[0-9a-f-]{36}$/i;

type CourseRow = {
  id: string;
  teacher_id: string;
  school_id: string;
  subject_enum: string | null;
  level: number | null;
  pdf_storage_path: string | null;
  organization_tags: string[] | null;
  pages_count: number | null;
};

type PageRange = { start: number; end: number };

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("[courses/generate-questions]", userError);
      return NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
    }

    const { data: isTeacher, error: teacherError } = await supabase.rpc(
      "is_current_user_school_teacher"
    );
    if (teacherError) {
      console.error("[courses/generate-questions]", teacherError);
      return NextResponse.json({ error: "Erreur de verification professeur" }, { status: 500 });
    }
    if (isTeacher !== true) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    const body = (await request.json()) as {
      courseId?: unknown;
      questionsCount?: unknown;
      page_range?: unknown;
    };
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const requestedQuestionsCount =
      typeof body.questionsCount === "number" && body.questionsCount > 0
        ? Math.min(body.questionsCount, MAX_QUESTIONS_PER_COURSE)
        : null;

    let pageRange: PageRange | null = null;
    if (body.page_range !== null && typeof body.page_range === "object") {
      const pr = body.page_range as Record<string, unknown>;
      if (typeof pr.start === "number" && typeof pr.end === "number") {
        pageRange = { start: Math.round(pr.start), end: Math.round(pr.end) };
      }
    }

    if (!UUID_REGEX.test(courseId)) {
      return NextResponse.json({ error: "courseId invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id, teacher_id, school_id, subject_enum, level, pdf_storage_path, organization_tags, pages_count")
      .eq("id", courseId)
      .limit(1)
      .maybeSingle();

    if (courseError) throw courseError;
    if (!course) {
      return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });
    }

    const typedCourse = course as CourseRow;

    if (typedCourse.teacher_id !== user.id) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }
    if (!typedCourse.pdf_storage_path) {
      return NextResponse.json({ error: "Aucun PDF associe a ce cours" }, { status: 400 });
    }

    // Plafond 600 questions/cours — vérifier avant de générer.
    const { count: currentCount, error: countError } = await admin
      .from("teacher_questions")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId);

    if (countError) {
      console.error("[courses/generate-questions] count error:", countError);
      return NextResponse.json({ error: "Erreur lors de la verification du plafond" }, { status: 500 });
    }

    const existing = currentCount ?? 0;
    if (existing >= MAX_QUESTIONS_PER_COURSE) {
      return NextResponse.json(
        {
          error:
            "Plafond 600 questions/cours atteint. Archive ou supprime des questions pour liberer de la place.",
        },
        { status: 400 }
      );
    }

    const targetQuestions =
      requestedQuestionsCount ?? autoTargetQuestions(typedCourse.pages_count ?? null);
    const cappedQuestionsCount = Math.min(targetQuestions, MAX_QUESTIONS_PER_COURSE - existing);

    // ── Create job row + trigger task ────────────────────────────────────────
    // worker_count est mis à 1 par défaut (placeholder UI) — le runner met
    // à jour cette valeur au nombre réel de chapitres dès qu'il a fini la
    // pré-pass de structure (extract-chapters). À ce moment le client poll
    // verra par exemple worker_count=8, workers_completed=2/8.
    const { data: jobRow, error: jobErr } = await admin
      .from("question_generation_jobs")
      .insert({
        course_id: courseId,
        teacher_id: user.id,
        school_id: typedCourse.school_id,
        status: "pending",
        phase: "queued",
        total_target: cappedQuestionsCount,
        worker_count: 1,
        pages_count: typedCourse.pages_count,
        page_range_start: pageRange?.start ?? null,
        page_range_end: pageRange?.end ?? null,
      })
      .select("id")
      .single();
    if (jobErr || !jobRow) {
      console.error("[courses/generate-questions] job insert failed:", jobErr);
      return NextResponse.json({ error: "Création du job échouée" }, { status: 500 });
    }
    const jobId = (jobRow as { id: string }).id;

    // Dispatch vers Trigger.dev cloud (non bloquant, run en process séparé).
    // Si le trigger échoue (réseau, auth Trigger.dev mort, etc.), on marque
    // le job failed immédiatement pour ne pas laisser le client en stuck.
    try {
      await tasks.trigger<typeof generateQuestionsTask>("generate-questions", { jobId });
    } catch (triggerErr) {
      await logError(triggerErr, {
        source: "api.courses.generate-questions.trigger",
        context: { jobId, courseId },
      });
      await admin
        .from("question_generation_jobs")
        .update({
          status: "failed",
          phase: "failed",
          error_message: `Trigger.dev dispatch failed: ${triggerErr instanceof Error ? triggerErr.message : String(triggerErr)}`.slice(0, 500),
          completed_at: new Date().toISOString(),
          phase_changed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return NextResponse.json(
        { error: "Impossible de démarrer la génération (queue indisponible)" },
        { status: 503 }
      );
    }

    return NextResponse.json({ jobId });
  } catch (error) {
    console.error("[courses/generate-questions]", error);
    await logError(error, {
      source: "api.courses.generate-questions.POST",
      context: { route: "/api/courses/generate-questions" },
    });
    if (error instanceof GracefulAIError) {
      return NextResponse.json({ error: "Service temporairement sature" }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
