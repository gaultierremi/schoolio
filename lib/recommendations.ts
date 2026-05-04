import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { QuizQuestion } from "@/lib/types";

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type DailyStudyPlan = {
  dueCount: number;
  newCount: number;
  estimatedMinutes: number;
  concepts: { id: string; name: string; score: number }[];
};

// Questions whose concepts are due for review (next_review <= now)
export async function getDueQuestions(userId: string): Promise<QuizQuestion[]> {
  const db = getDb();
  const now = new Date().toISOString();

  const { data: dueRows } = await db
    .from("user_concept_mastery")
    .select("concept_id")
    .eq("user_id", userId)
    .lte("next_review", now);

  const dueConceptIds = ((dueRows ?? []) as { concept_id: string }[]).map(
    (r) => r.concept_id
  );

  if (dueConceptIds.length === 0) return [];

  const { data: linkRows } = await db
    .from("question_concepts")
    .select("question_id")
    .in("concept_id", dueConceptIds);

  const questionIds = [
    ...new Set(
      ((linkRows ?? []) as { question_id: string }[]).map((r) => r.question_id)
    ),
  ];

  if (questionIds.length === 0) return [];

  const { data: questions } = await db
    .from("quiz_questions")
    .select("*")
    .in("id", questionIds)
    .eq("status", "approved")
    .limit(20);

  return (questions ?? []) as QuizQuestion[];
}

export async function getDailyStudyPlan(
  userId: string
): Promise<DailyStudyPlan> {
  const db = getDb();
  const now = new Date().toISOString();

  type MasteryRow = {
    concept_id: string;
    mastery_score: number;
    concept: { id: string; name: string } | null;
  };

  const { data: dueRows } = await db
    .from("user_concept_mastery")
    .select("concept_id, mastery_score, concept:concepts(id,name)")
    .eq("user_id", userId)
    .lte("next_review", now);

  const due = ((dueRows ?? []) as unknown as MasteryRow[]);
  const dueConceptIds = due.map((r) => r.concept_id);

  let dueCount = 0;
  if (dueConceptIds.length > 0) {
    const { count } = await db
      .from("question_concepts")
      .select("question_id", { count: "exact", head: true })
      .in("concept_id", dueConceptIds);
    dueCount = Math.min(count ?? 0, 20);
  }

  // Weak concepts: score < 40 → "new" questions recommended
  const { data: weakRows } = await db
    .from("user_concept_mastery")
    .select("concept_id")
    .eq("user_id", userId)
    .lt("mastery_score", 40);

  const weakIds = ((weakRows ?? []) as { concept_id: string }[]).map(
    (r) => r.concept_id
  );

  let newCount = 0;
  if (weakIds.length > 0) {
    const { count } = await db
      .from("question_concepts")
      .select("question_id", { count: "exact", head: true })
      .in("concept_id", weakIds);
    newCount = Math.min((count ?? 0) > 0 ? 5 : 0, 5);
  }

  const estimatedMinutes = Math.max(1, Math.round((dueCount + newCount) * 2));

  const concepts = due
    .filter((r) => r.concept !== null)
    .map((r) => ({
      id: r.concept_id,
      name: (r.concept as { name: string }).name,
      score: r.mastery_score,
    }))
    .slice(0, 5);

  return { dueCount, newCount, estimatedMinutes, concepts };
}

// Consecutive days with at least one study session
export async function getStudyStreak(userId: string): Promise<number> {
  const db = getDb();

  const { data } = await db
    .from("study_sessions")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!data?.length) return 0;

  const uniqueDates = [
    ...new Set(
      (data as { created_at: string }[]).map((s) => s.created_at.slice(0, 10))
    ),
  ]
    .sort()
    .reverse();

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;

  let streak = 0;
  let expected = uniqueDates[0];

  for (const d of uniqueDates) {
    if (d === expected) {
      streak++;
      const prev = new Date(expected);
      prev.setDate(prev.getDate() - 1);
      expected = prev.toISOString().slice(0, 10);
    } else {
      break;
    }
  }

  return streak;
}

// Weekly report via Claude Haiku
export async function generateWeeklyReport(userId: string): Promise<string> {
  const db = getDb();

  type Row = {
    mastery_score: number;
    correct: number;
    attempts: number;
    concept: { name: string } | null;
  };

  const { data } = await db
    .from("user_concept_mastery")
    .select("mastery_score, correct, attempts, concept:concepts(name)")
    .eq("user_id", userId)
    .order("mastery_score", { ascending: false })
    .limit(20);

  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) => r.concept !== null
  );

  if (rows.length === 0) {
    return "Pas encore de données disponibles pour générer un rapport.";
  }

  const summaryText = rows
    .map(
      (r) =>
        `- ${(r.concept as { name: string }).name}: ${r.mastery_score}/100 (${r.correct}/${r.attempts} correctes)`
    )
    .join("\n");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Tu es un coach pédagogique bienveillant. Génère un rapport hebdomadaire personnalisé en 3-4 phrases en français basé sur ces données de maîtrise. Sois encourageant et précis. Cite des concepts spécifiques.\n\n${summaryText}`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}
