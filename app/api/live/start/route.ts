import { NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/api/auth";
import { apiError, apiOk, safeError } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase-server";
import { requireSchoolMembership } from "@/lib/tenant";
import { generateLiveSessionCode } from "@/lib/live/codes";
import { logError } from "@/lib/observability/log-error";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function admin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    // Rule 4
    const auth = await requireTeacher();
    if (!auth.ok) return auth.response;

    const supabase = createClient();
    const schoolId = await requireSchoolMembership(supabase);

    const body = (await req.json()) as {
      title?: unknown;
      question_ids?: unknown;
      class_id?: unknown;
      course_id?: unknown;
    };

    // Rule 7 — validate
    if (typeof body.title !== "string" || body.title.trim().length === 0 || body.title.length > 200) {
      return apiError("title invalide", 400);
    }
    if (!Array.isArray(body.question_ids) || body.question_ids.length === 0 || body.question_ids.length > 50) {
      return apiError("question_ids doit être un tableau de 1-50 IDs", 400);
    }
    const questionIds: string[] = [];
    for (const id of body.question_ids) {
      if (typeof id !== "string" || !UUID_RE.test(id)) {
        return apiError("question_ids contient un UUID invalide", 400);
      }
      questionIds.push(id);
    }
    let classId: string | null = null;
    if (body.class_id !== undefined && body.class_id !== null) {
      if (typeof body.class_id !== "string" || !UUID_RE.test(body.class_id)) {
        return apiError("class_id invalide", 400);
      }
      classId = body.class_id;
    }
    let courseId: string | null = null;
    if (body.course_id !== undefined && body.course_id !== null) {
      if (typeof body.course_id !== "string" || !UUID_RE.test(body.course_id)) {
        return apiError("course_id invalide", 400);
      }
      courseId = body.course_id;
    }

    // Verify questions belong to the school (defense in depth on top of RLS)
    const a = admin();
    const { data: qs, error: qErr } = await a
      .from("teacher_questions")
      .select("id, school_id")
      .in("id", questionIds);
    if (qErr) throw qErr;
    if (!qs || qs.length !== questionIds.length) {
      return apiError("Certaines questions sont introuvables", 404);
    }
    for (const q of qs as { school_id: string }[]) {
      if (q.school_id !== schoolId) {
        return apiError("Une question n'appartient pas à votre école", 403);
      }
    }

    // Generate a unique code (retry once on conflict — rare with 32^6 space).
    let code = generateLiveSessionCode();
    let { data: session, error: insErr } = await a
      .from("live_sessions")
      .insert({
        code,
        teacher_id: auth.user.id,
        school_id: schoolId,
        class_id: classId,
        course_id: courseId,
        title: body.title.trim().slice(0, 200),
        question_ids: questionIds,
        current_index: 0,
        phase: "lobby",
      })
      .select("id, code, phase, current_index, question_ids")
      .single();

    if (insErr?.code === "23505") {
      // Code collision — retry once
      code = generateLiveSessionCode();
      const retry = await a
        .from("live_sessions")
        .insert({
          code,
          teacher_id: auth.user.id,
          school_id: schoolId,
          class_id: classId,
          course_id: courseId,
          title: body.title.trim().slice(0, 200),
          question_ids: questionIds,
          current_index: 0,
          phase: "lobby",
        })
        .select("id, code, phase, current_index, question_ids")
        .single();
      session = retry.data;
      insErr = retry.error;
    }

    if (insErr || !session) {
      await logError(insErr, {
        source: "api.live.start.POST",
        context: { schoolId, code },
        userId: auth.user.id,
        schoolId,
      });
      return apiError(`Création de la session live échouée : ${insErr?.message ?? "no row"}`, 500);
    }

    return apiOk({ session }, 201);
  } catch (err) {
    await logError(err, { source: "api.live.start.POST" });
    return safeError(err, "live:start");
  }
}
