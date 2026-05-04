import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { SUBJECTS_BY_ID, isValidSubject, type SubjectId } from "@/lib/subjects";

export const dynamic = "force-dynamic";

type TeacherQuestionStatsRow = {
  subject_enum: string | null;
  level: number | null;
  is_public: boolean | null;
  created_at: string | null;
};

type QuestionsBySubject = {
  subject_enum: SubjectId;
  label: string;
  emoji: string;
  count: number;
};

type QuestionsByLevel = {
  level: number | null;
  count: number;
};

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getSubjectId(value: string | null): SubjectId {
  return isValidSubject(value) ? value : "autre";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur inconnue";
}

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("[school/stats]", userError);
      return NextResponse.json({ error: "Erreur d'authentification" }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: isTeacher, error: teacherError } = await supabase.rpc(
      "is_current_user_school_teacher"
    );

    if (teacherError) {
      console.error("[school/stats]", teacherError);
      return NextResponse.json({ error: "Erreur de vérification professeur" }, { status: 500 });
    }

    if (isTeacher !== true) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const admin = createAdminClient();

    const [
      teacherQuestionsResult,
      sessionsResult,
      approvedQuestionsResult,
      aiGeneratedQuestionsResult,
    ] = await Promise.all([
      admin
        .from("teacher_questions")
        .select("subject_enum, level, is_public, created_at")
        .eq("teacher_id", user.id),
      admin
        .from("school_game_sessions")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", user.id),
      admin
        .from("quiz_questions")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      admin
        .from("quiz_questions")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .eq("is_ai_generated", true),
    ]);

    if (teacherQuestionsResult.error) throw teacherQuestionsResult.error;
    if (sessionsResult.error) throw sessionsResult.error;
    if (approvedQuestionsResult.error) throw approvedQuestionsResult.error;
    if (aiGeneratedQuestionsResult.error) throw aiGeneratedQuestionsResult.error;

    const teacherQuestions =
      (teacherQuestionsResult.data ?? []) as TeacherQuestionStatsRow[];

    const subjectCounts = new Map<SubjectId, number>();
    const levelCounts = new Map<number | null, number>();

    let publicQuestions = 0;
    let lastQuestionCreatedAt: string | null = null;

    for (const question of teacherQuestions) {
      const subjectId = getSubjectId(question.subject_enum);
      subjectCounts.set(subjectId, (subjectCounts.get(subjectId) ?? 0) + 1);
      levelCounts.set(question.level, (levelCounts.get(question.level) ?? 0) + 1);

      if (question.is_public === true) {
        publicQuestions += 1;
      }

      if (
        question.created_at &&
        (!lastQuestionCreatedAt || question.created_at > lastQuestionCreatedAt)
      ) {
        lastQuestionCreatedAt = question.created_at;
      }
    }

    const questionsBySubject: QuestionsBySubject[] = Array.from(subjectCounts)
      .map(([subject_enum, count]) => {
        const subject = SUBJECTS_BY_ID[subject_enum];
        return {
          subject_enum,
          label: subject.label,
          emoji: subject.emoji,
          count,
        };
      })
      .sort((a, b) => b.count - a.count);

    const questionsByLevel: QuestionsByLevel[] = Array.from(levelCounts)
      .map(([level, count]) => ({ level, count }))
      .sort((a, b) => {
        if (a.level === null && b.level === null) return 0;
        if (a.level === null) return 1;
        if (b.level === null) return -1;
        return a.level - b.level;
      });

    const approvedQuestions = approvedQuestionsResult.count ?? 0;
    const aiGeneratedQuestions = aiGeneratedQuestionsResult.count ?? 0;
    const aiGeneratedShare =
      approvedQuestions === 0
        ? 0
        : Math.round((aiGeneratedQuestions / approvedQuestions) * 100);

    return NextResponse.json({
      totalQuestions: teacherQuestions.length,
      questionsBySubject,
      questionsByLevel,
      publicQuestions,
      lastQuestionCreatedAt,
      sessionsCreated: sessionsResult.count ?? 0,
      aiGeneratedShare,
    });
  } catch (error) {
    console.error("[school/stats]", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
