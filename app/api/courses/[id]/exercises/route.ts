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

const VALID_STATUSES = new Set(["pending", "validated", "rejected", "archived"]);

export async function GET(
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

    // Verify course ownership
    const { data: course, error: courseErr } = await admin
      .from("courses")
      .select("id")
      .eq("id", params.id)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (courseErr) throw courseErr;
    if (!course) {
      return NextResponse.json({ error: "Cours introuvable" }, { status: 404 });
    }

    // Optional ?status= filter
    const statusParam = req.nextUrl.searchParams.get("status");
    const statusFilter = statusParam && VALID_STATUSES.has(statusParam) ? statusParam : null;

    let query = admin
      .from("exercises")
      .select("*, exercise_steps(*)")
      .eq("course_id", params.id)
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data: exercises, error: exErr } = await query;
    if (exErr) throw exErr;

    // Sort steps by step_number within each exercise
    const result = (exercises ?? []).map((ex) => ({
      ...ex,
      exercise_steps: Array.isArray(ex.exercise_steps)
        ? [...ex.exercise_steps].sort(
            (a: { step_number: number }, b: { step_number: number }) =>
              a.step_number - b.step_number
          )
        : [],
    }));

    return NextResponse.json({ exercises: result });
  } catch (err) {
    console.error("[exercises:GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
