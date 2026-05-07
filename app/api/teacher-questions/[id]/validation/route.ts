import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

type ValidationAction = "validate" | "reject" | "unvalidate";

type TeacherQuestionRow = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidationAction(value: unknown): value is ValidationAction {
  return value === "validate" || value === "reject" || value === "unvalidate";
}

function isValidDifficultyStars(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("[teacher-questions/validation]", userError);
      return NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    if (!isRecord(body) || !isValidationAction(body.action)) {
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });
    }

    if (
      body.difficulty_stars !== undefined &&
      !isValidDifficultyStars(body.difficulty_stars)
    ) {
      return NextResponse.json({ error: "Difficulté invalide" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: questionData, error: questionError } = await admin
      .from("teacher_questions")
      .select("id, teacher_id")
      .eq("id", params.id)
      .maybeSingle();

    if (questionError) throw questionError;

    if (!questionData) {
      return NextResponse.json({ error: "Question introuvable" }, { status: 404 });
    }

    const question = questionData as TeacherQuestionRow;
    if (question.teacher_id !== user.id) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const update: {
      validated_at?: string | null;
      rejected_at?: string | null;
      difficulty_stars?: 1 | 2 | 3;
    } = {};

    if (body.action === "validate") {
      update.validated_at = new Date().toISOString();
      update.rejected_at = null;

      if (body.difficulty_stars !== undefined) {
        update.difficulty_stars = body.difficulty_stars;
      }
    }

    if (body.action === "reject") {
      update.rejected_at = new Date().toISOString();
      update.validated_at = null;
    }

    if (body.action === "unvalidate") {
      update.validated_at = null;
      update.rejected_at = null;
    }

    const { data: updatedQuestion, error: updateError } = await admin
      .from("teacher_questions")
      .update(update)
      .eq("id", params.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ question: updatedQuestion });
  } catch (error) {
    console.error("[teacher-questions/validation]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
