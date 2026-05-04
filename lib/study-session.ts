import { createClient } from "@supabase/supabase-js";

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type StudySessionConfig = {
  subject: string;
  source: string;
  questionCount: number;
  mode: "normal" | "adaptive";
  difficulty: number;
  topic?: string;
};

export type StudySession = {
  id: string;
  user_id: string;
  subject: string;
  source: string;
  question_count: number;
  mode: string;
  difficulty: number;
  topic: string | null;
  completed_at: string | null;
  created_at: string;
};

export type SubjectStat = {
  subject: string;
  sessionCount: number;
  totalAnswered: number;
  totalCorrect: number;
  masteryRate: number;
};

export async function createStudySession(
  userId: string,
  config: StudySessionConfig
): Promise<string> {
  const db = getDb();
  const { data, error } = await db
    .from("study_sessions")
    .insert({
      user_id: userId,
      subject: config.subject,
      source: config.source,
      question_count: config.questionCount,
      mode: config.mode,
      difficulty: config.difficulty,
      topic: config.topic ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function getStudySession(
  sessionId: string
): Promise<StudySession | null> {
  const db = getDb();
  const { data, error } = await db
    .from("study_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as StudySession | null;
}

export async function updateStudyProgress(
  sessionId: string,
  questionId: string,
  correct: boolean
): Promise<void> {
  const db = getDb();
  await db.from("study_progress").insert({
    session_id: sessionId,
    question_id: questionId,
    correct,
  });
}

export async function completeStudySession(sessionId: string): Promise<void> {
  const db = getDb();
  await db
    .from("study_sessions")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", sessionId);
}

export async function getStudyStats(userId: string): Promise<{
  bySubject: SubjectStat[];
  totalSessions: number;
  totalAnswered: number;
  totalCorrect: number;
  recentSessions: StudySession[];
}> {
  const db = getDb();

  const { data: sessions } = await db
    .from("study_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const sessionList = (sessions ?? []) as StudySession[];

  if (sessionList.length === 0) {
    return {
      bySubject: [],
      totalSessions: 0,
      totalAnswered: 0,
      totalCorrect: 0,
      recentSessions: [],
    };
  }

  const sessionIds = sessionList.map((s) => s.id);

  const { data: progressRows } = await db
    .from("study_progress")
    .select("session_id, correct")
    .in("session_id", sessionIds);

  const progress = (progressRows ?? []) as {
    session_id: string;
    correct: boolean;
  }[];

  const subjectMap: Record<
    string,
    { sessions: Set<string>; answered: number; correct: number }
  > = {};

  for (const session of sessionList) {
    if (!subjectMap[session.subject]) {
      subjectMap[session.subject] = { sessions: new Set(), answered: 0, correct: 0 };
    }
    subjectMap[session.subject].sessions.add(session.id);
  }

  for (const row of progress) {
    const session = sessionList.find((s) => s.id === row.session_id);
    if (!session) continue;
    const entry = subjectMap[session.subject];
    if (entry) {
      entry.answered++;
      if (row.correct) entry.correct++;
    }
  }

  const bySubject: SubjectStat[] = Object.entries(subjectMap).map(
    ([subject, data]) => ({
      subject,
      sessionCount: data.sessions.size,
      totalAnswered: data.answered,
      totalCorrect: data.correct,
      masteryRate:
        data.answered > 0
          ? Math.round((data.correct / data.answered) * 100)
          : 0,
    })
  );

  return {
    bySubject,
    totalSessions: sessionList.length,
    totalAnswered: progress.length,
    totalCorrect: progress.filter((r) => r.correct).length,
    recentSessions: sessionList.slice(0, 5),
  };
}
