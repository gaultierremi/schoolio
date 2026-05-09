import { NextResponse } from "next/server";
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

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: isTeacher } = await supabase.rpc("is_current_user_school_teacher");
    if (isTeacher !== true) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const admin = createAdminClient();

    // Fetch classes first (needed for class-scoped queries)
    const { data: classes } = await admin
      .from("classes")
      .select("id, name, level, subject, archived_at, created_at")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false });

    const allClasses = classes ?? [];
    const activeClasses = allClasses.filter((c) => !c.archived_at);
    const allClassIds = allClasses.map((c) => c.id as string);
    const activeClassIds = activeClasses.map((c) => c.id as string);

    // Parallel KPI + to_handle queries
    const [
      coursesCount,
      studentsCount,
      assignmentsCount,
      validatedQuestionsCount,
      pendingExercisesCount,
      pendingQuestionsCount,
    ] = await Promise.all([
      admin
        .from("courses")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", user.id)
        .then((r) => r.count ?? 0),
      activeClassIds.length > 0
        ? admin
            .from("class_memberships")
            .select("id", { count: "exact", head: true })
            .in("class_id", activeClassIds)
            .eq("status", "active")
            .then((r) => r.count ?? 0)
        : Promise.resolve(0),
      allClassIds.length > 0
        ? admin
            .from("assignments")
            .select("id", { count: "exact", head: true })
            .in("class_id", allClassIds)
            .is("archived_at", null)
            .then((r) => r.count ?? 0)
        : Promise.resolve(0),
      admin
        .from("teacher_questions")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", user.id)
        .not("validated_at", "is", null)
        .is("rejected_at", null)
        .then((r) => r.count ?? 0),
      admin
        .from("exercises")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", user.id)
        .eq("status", "pending")
        .then((r) => r.count ?? 0),
      admin
        .from("teacher_questions")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", user.id)
        .is("validated_at", null)
        .is("rejected_at", null)
        .then((r) => r.count ?? 0),
    ]);

    // Overdue assignments: due_date < now AND completion rate < 80%
    let overdueCount = 0;
    if (allClassIds.length > 0) {
      const { data: overdueRaw } = await admin
        .from("assignments")
        .select("id, class_id")
        .in("class_id", allClassIds)
        .lt("due_date", new Date().toISOString())
        .is("archived_at", null);

      if (overdueRaw && overdueRaw.length > 0) {
        const assignmentIds = overdueRaw.map((a) => a.id as string);

        const [completionsRes, membershipsRes] = await Promise.all([
          admin
            .from("assignment_completions")
            .select("assignment_id")
            .in("assignment_id", assignmentIds)
            .eq("status", "completed"),
          admin
            .from("class_memberships")
            .select("class_id")
            .in("class_id", activeClassIds)
            .eq("status", "active"),
        ]);

        const completionMap: Record<string, number> = {};
        for (const c of completionsRes.data ?? []) {
          const aid = c.assignment_id as string;
          completionMap[aid] = (completionMap[aid] ?? 0) + 1;
        }
        const memberMap: Record<string, number> = {};
        for (const m of membershipsRes.data ?? []) {
          const cid = m.class_id as string;
          memberMap[cid] = (memberMap[cid] ?? 0) + 1;
        }

        for (const a of overdueRaw) {
          const total = memberMap[a.class_id as string] ?? 0;
          if (total === 0) continue;
          const completed = completionMap[a.id as string] ?? 0;
          if (completed / total < 0.8) overdueCount++;
        }
      }
    }

    // Schedule setup info
    const [profileResult, slotCountResult] = await Promise.all([
      admin.from("user_profiles").select("schedule_onboarding_dismissed").eq("id", user.id).maybeSingle(),
      admin.from("teacher_schedule_slots").select("id", { count: "exact", head: true }).eq("teacher_id", user.id),
    ]);
    const schedule_setup = {
      onboarding_dismissed: profileResult.data?.schedule_onboarding_dismissed ?? false,
      has_slots: (slotCountResult.count ?? 0) > 0,
    };

    // Classes preview: top 3 active with member counts
    const previewClasses = activeClasses.slice(0, 3);
    const previewIds = previewClasses.map((c) => c.id as string);
    const memberCountMap: Record<string, number> = {};

    if (previewIds.length > 0) {
      const { data: members } = await admin
        .from("class_memberships")
        .select("class_id")
        .in("class_id", previewIds)
        .eq("status", "active");
      for (const m of members ?? []) {
        const cid = m.class_id as string;
        memberCountMap[cid] = (memberCountMap[cid] ?? 0) + 1;
      }
    }

    const classes_preview = previewClasses.map((c) => ({
      id: c.id as string,
      name: c.name as string,
      level: (c.level as number | null) ?? null,
      subject: (c.subject as string | null) ?? null,
      member_count: memberCountMap[c.id as string] ?? 0,
    }));

    return NextResponse.json({
      stats: {
        total_courses: coursesCount,
        active_students: studentsCount,
        active_classes: activeClassIds.length,
        total_assignments: assignmentsCount,
        validated_questions: validatedQuestionsCount,
      },
      to_handle: {
        pending_exercises: pendingExercisesCount,
        pending_questions: pendingQuestionsCount,
        overdue_assignments: overdueCount,
      },
      classes_preview,
      schedule_setup,
    });
  } catch (error) {
    console.error("[dashboard-summary:GET]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
