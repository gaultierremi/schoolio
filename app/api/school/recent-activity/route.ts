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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur inconnue";
}

const EVENT_LABELS: Record<string, string> = {
  student_completed_quiz:    "Un élève a complété un quiz",
  student_started_quiz:      "Un élève a commencé un quiz",
  student_read_pdf:          "Un élève a lu un PDF",
  student_joined_class:      "Un élève a rejoint une classe",
  student_left_class:        "Un élève a quitté une classe",
  teacher_validated_question: "Question validée",
  teacher_rejected_question:  "Question rejetée",
  teacher_unvalidated_question: "Question réinitialisée",
  teacher_validated_exercise: "Exercice validé",
  teacher_rejected_exercise:  "Exercice rejeté",
  teacher_created_class:      "Nouvelle classe créée",
  teacher_created_assignment: "Nouveau devoir créé",
  teacher_imported_pdf:       "PDF importé et analysé",
  teacher_added_schedule_slot:   "Créneau ajouté à l'emploi du temps",
  teacher_updated_schedule_slot: "Créneau modifié",
  teacher_dismissed_onboarding:  "Onboarding emploi du temps ignoré",
};

type FilterParam = "all" | "students" | "teacher" | "system";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "15", 10), 1), 50);
    const filter = (searchParams.get("filter") ?? "all") as FilterParam;

    const admin = createAdminClient();
    let query = admin
      .from("activity_events")
      .select("id, event_type, actor_type, context, created_at")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filter === "students") query = query.eq("actor_type", "student");
    else if (filter === "teacher") query = query.eq("actor_type", "teacher");
    else if (filter === "system") query = query.eq("actor_type", "system");

    const { data: events, error } = await query;
    if (error) throw error;

    const formatted = (events ?? []).map((e) => ({
      id: e.id as string,
      event_type: e.event_type as string,
      actor_type: e.actor_type as string,
      label: EVENT_LABELS[e.event_type as string] ?? (e.event_type as string),
      context: (e.context ?? {}) as Record<string, unknown>,
      created_at: e.created_at as string,
    }));

    return NextResponse.json({ events: formatted });
  } catch (error) {
    console.error("[recent-activity:GET]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
