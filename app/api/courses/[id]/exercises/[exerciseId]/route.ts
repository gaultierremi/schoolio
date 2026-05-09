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

type StepPatch = {
  step_number: number;
  title?: string | null;
  content: string;
  method_or_concept?: string | null;
  is_final_answer?: boolean;
};

type PatchBody = {
  title?: string;
  statement?: string;
  exercise_type?: string;
  steps?: StepPatch[];
};

const VALID_TYPES = new Set(["calcul", "demonstration", "analyse", "redaction", "application", "autre"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; exerciseId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) {
      return NextResponse.json({ error: "Accès réservé aux professeurs" }, { status: 403 });
    }

    const admin = createAdminClient();

    const { data: exercise, error } = await admin
      .from("exercises")
      .select("*, exercise_steps(*)")
      .eq("id", params.exerciseId)
      .eq("course_id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!exercise) {
      return NextResponse.json({ error: "Exercice introuvable" }, { status: 404 });
    }

    const result = {
      ...exercise,
      exercise_steps: Array.isArray(exercise.exercise_steps)
        ? [...exercise.exercise_steps].sort(
            (a: { step_number: number }, b: { step_number: number }) =>
              a.step_number - b.step_number
          )
        : [],
    };

    return NextResponse.json({ exercise: result });
  } catch (err) {
    console.error("[exercises/[exerciseId]:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; exerciseId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) {
      return NextResponse.json({ error: "Accès réservé aux professeurs" }, { status: 403 });
    }

    const admin = createAdminClient();

    const { data: existing, error: fetchErr } = await admin
      .from("exercises")
      .select("id")
      .eq("id", params.exerciseId)
      .eq("course_id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) {
      return NextResponse.json({ error: "Exercice introuvable" }, { status: 404 });
    }

    const body = await req.json() as PatchBody;

    // Build exercise update payload
    const exerciseUpdate: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) {
      exerciseUpdate.title = body.title.trim().slice(0, 80);
    }
    if (typeof body.statement === "string" && body.statement.trim()) {
      exerciseUpdate.statement = body.statement.trim();
    }
    if (typeof body.exercise_type === "string" && VALID_TYPES.has(body.exercise_type)) {
      exerciseUpdate.exercise_type = body.exercise_type;
    }

    if (Object.keys(exerciseUpdate).length > 0) {
      const { error: updateErr } = await admin
        .from("exercises")
        .update(exerciseUpdate)
        .eq("id", params.exerciseId);
      if (updateErr) throw updateErr;
    }

    // Replace steps if provided
    if (Array.isArray(body.steps) && body.steps.length >= 1) {
      const { error: deleteErr } = await admin
        .from("exercise_steps")
        .delete()
        .eq("exercise_id", params.exerciseId);
      if (deleteErr) throw deleteErr;

      const stepRows = body.steps.map((s, i) => ({
        exercise_id: params.exerciseId,
        step_number: typeof s.step_number === "number" ? s.step_number : i + 1,
        title: s.title ?? null,
        content: s.content,
        method_or_concept: s.method_or_concept ?? null,
        is_final_answer: s.is_final_answer === true,
      }));

      const { error: insertErr } = await admin.from("exercise_steps").insert(stepRows);
      if (insertErr) throw insertErr;
    }

    // Return updated exercise with steps
    const { data: result, error: resultErr } = await admin
      .from("exercises")
      .select("*, exercise_steps(*)")
      .eq("id", params.exerciseId)
      .single();

    if (resultErr) throw resultErr;

    const final = {
      ...result,
      exercise_steps: Array.isArray(result.exercise_steps)
        ? [...result.exercise_steps].sort(
            (a: { step_number: number }, b: { step_number: number }) =>
              a.step_number - b.step_number
          )
        : [],
    };

    return NextResponse.json({ exercise: final });
  } catch (err) {
    console.error("[exercises/[exerciseId]:PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
