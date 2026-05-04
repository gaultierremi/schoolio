import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type Concept = {
  id: string;
  name: string;
  description: string | null;
  period: string | null;
  subject: string;
  created_at: string;
};

export type ConceptMastery = {
  concept_id: string;
  mastery_score: number;
  attempts: number;
  correct: number;
  last_seen: string;
  next_review: string;
  concept: Concept;
};

export async function getAllConcepts(): Promise<Concept[]> {
  const db = getDb();
  const { data, error } = await db.from("concepts").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Concept[];
}

export async function updateConceptMastery(
  userId: string,
  conceptId: string,
  correct: boolean
): Promise<void> {
  const db = getDb();

  const { data: existing } = await db
    .from("user_concept_mastery")
    .select("mastery_score, attempts, correct")
    .eq("user_id", userId)
    .eq("concept_id", conceptId)
    .maybeSingle();

  type Row = { mastery_score: number; attempts: number; correct: number };
  const row = existing as Row | null;

  const currentScore = row?.mastery_score ?? 0;
  const newScore = correct
    ? Math.min(100, currentScore + 5)
    : Math.max(0, currentScore - 8);

  const nextReviewDays =
    newScore < 30 ? 1 : newScore < 60 ? 3 : newScore < 80 ? 7 : 14;
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + nextReviewDays);

  await db.from("user_concept_mastery").upsert(
    {
      user_id: userId,
      concept_id: conceptId,
      mastery_score: newScore,
      attempts: (row?.attempts ?? 0) + 1,
      correct: (row?.correct ?? 0) + (correct ? 1 : 0),
      last_seen: new Date().toISOString(),
      next_review: nextReview.toISOString(),
    },
    { onConflict: "user_id,concept_id" }
  );
}

export async function getUserMastery(userId: string): Promise<ConceptMastery[]> {
  const db = getDb();
  const { data, error } = await db
    .from("user_concept_mastery")
    .select("*, concept:concepts(*)")
    .eq("user_id", userId)
    .order("mastery_score", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ConceptMastery[];
}

export async function getWeakConcepts(
  userId: string,
  limit = 3
): Promise<ConceptMastery[]> {
  const mastery = await getUserMastery(userId);
  return mastery.sort((a, b) => a.mastery_score - b.mastery_score).slice(0, limit);
}

export async function tagQuestionWithConcepts(
  questionId: string,
  questionType: string,
  conceptIds: string[]
): Promise<void> {
  if (conceptIds.length === 0) return;
  const db = getDb();
  const rows = conceptIds.map((conceptId) => ({
    question_id: questionId,
    question_type: questionType,
    concept_id: conceptId,
  }));
  await db
    .from("question_concepts")
    .upsert(rows, { onConflict: "question_id,concept_id", ignoreDuplicates: true });
}

export async function inferConceptsFromQuestion(
  question: string,
  period: string | null,
  subject = "histoire"
): Promise<string[]> {
  const db = getDb();
  const { data: concepts } = await db
    .from("concepts")
    .select("id, name")
    .order("name");

  if (!concepts || concepts.length === 0) return [];

  const conceptList = (concepts as { id: string; name: string }[])
    .map((c) => `- ${c.id}: ${c.name}`)
    .join("\n");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `Tu es un assistant pédagogique. Identifie les concepts historiques liés à cette question de quiz.

Question: "${question}"
Période: ${period ?? "inconnue"}
Matière: ${subject}

Concepts disponibles:
${conceptList}

Réponds UNIQUEMENT avec un tableau JSON d'IDs (max 3 concepts), exemple: ["id1","id2"]
Si aucun concept ne correspond, réponds: []`,
      },
    ],
  });

  try {
    const text =
      response.content[0].type === "text"
        ? response.content[0].text.trim()
        : "[]";
    const ids = JSON.parse(text) as string[];
    const validIds = new Set((concepts as { id: string }[]).map((c) => c.id));
    return ids.filter((id) => typeof id === "string" && validIds.has(id));
  } catch {
    return [];
  }
}
