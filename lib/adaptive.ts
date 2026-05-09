import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  inferConceptsFromQuestion,
  tagQuestionWithConcepts,
  updateConceptMastery,
} from "@/lib/concepts";
import type { QuizQuestion, QuizDifficulty } from "@/lib/types";

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function recordQuizAnswer(
  userId: string,
  questionId: string,
  questionType: string,
  correct: boolean,
  period: string | null,
  questionText: string
): Promise<void> {
  const db = getDb();

  const { data: existing } = await db
    .from("question_concepts")
    .select("concept_id")
    .eq("question_id", questionId);

  let conceptIds = ((existing ?? []) as { concept_id: string }[]).map(
    (r) => r.concept_id
  );

  if (conceptIds.length === 0) {
    conceptIds = await inferConceptsFromQuestion(questionText, period);
    if (conceptIds.length > 0) {
      await tagQuestionWithConcepts(questionId, questionType, conceptIds);
    }
  }

  for (const conceptId of conceptIds) {
    await updateConceptMastery(userId, conceptId, correct);
  }
}

export async function getAdaptiveQuestions(
  userId: string,
  difficulty: QuizDifficulty,
  count = 10
): Promise<QuizQuestion[]> {
  const db = getDb();

  const { data: masteryData } = await db
    .from("user_concept_mastery")
    .select("concept_id, mastery_score")
    .eq("user_id", userId);

  const masteryMap = new Map<string, number>(
    ((masteryData ?? []) as { concept_id: string; mastery_score: number }[]).map(
      (m) => [m.concept_id, m.mastery_score]
    )
  );

  const weakIds: string[] = [];
  const mediumIds: string[] = [];
  const strongIds: string[] = [];

  for (const [id, score] of masteryMap) {
    if (score < 50) weakIds.push(id);
    else if (score <= 80) mediumIds.push(id);
    else strongIds.push(id);
  }

  const weakTarget = Math.round(count * 0.6);
  const mediumTarget = Math.round(count * 0.3);
  const strongTarget = count - weakTarget - mediumTarget;

  async function questionsForConcepts(
    conceptIds: string[],
    target: number
  ): Promise<QuizQuestion[]> {
    if (conceptIds.length === 0 || target === 0) return [];

    const { data: links } = await db
      .from("question_concepts")
      .select("question_id")
      .in("concept_id", conceptIds)
      .limit(target * 5);

    if (!links || links.length === 0) return [];

    const qIds = [
      ...new Set((links as { question_id: string }[]).map((r) => r.question_id)),
    ];

    const { data: questions } = await db
      .from("quiz_questions")
      .select("*")
      .in("id", qIds)
      .eq("status", "approved")
      .eq("difficulty", difficulty)
      .limit(target * 2);

    if (!questions) return [];

    const shuffled = [...questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, target) as QuizQuestion[];
  }

  const [weakQs, mediumQs, strongQs] = await Promise.all([
    questionsForConcepts(weakIds, weakTarget),
    questionsForConcepts(mediumIds, mediumTarget),
    questionsForConcepts(strongIds, strongTarget),
  ]);

  const combined = [...weakQs, ...mediumQs, ...strongQs];
  const needed = count - combined.length;

  if (needed > 0) {
    const usedIds = new Set(combined.map((q) => q.id));
    const baseQuery = db
      .from("quiz_questions")
      .select("*")
      .eq("status", "approved")
      .eq("difficulty", difficulty)
      .limit(needed * 3);

    const { data: filler } =
      usedIds.size > 0
        ? await baseQuery.not("id", "in", `(${[...usedIds].join(",")})`)
        : await baseQuery;

    if (filler) {
      const shuffled = [...filler];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      combined.push(...(shuffled.slice(0, needed) as QuizQuestion[]));
    }
  }

  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined.slice(0, count);
}

export type ConceptDelta = {
  concept_id: string;
  name: string;
  score_before: number;
  score_after: number;
  delta: number;
};

export async function getConceptProgressDelta(
  userId: string,
  conceptIds: string[],
  beforeScores: Record<string, number>
): Promise<ConceptDelta[]> {
  if (conceptIds.length === 0) return [];
  const db = getDb();

  const { data } = await db
    .from("user_concept_mastery")
    .select("concept_id, mastery_score, concept:concepts(name)")
    .eq("user_id", userId)
    .in("concept_id", conceptIds);

  return (
    (
      data as
        | { concept_id: string; mastery_score: number; concept: { name: string } }[]
        | null
    ) ?? []
  ).map((row) => ({
    concept_id: row.concept_id,
    name: row.concept.name,
    score_before: beforeScores[row.concept_id] ?? 0,
    score_after: row.mastery_score,
    delta: row.mastery_score - (beforeScores[row.concept_id] ?? 0),
  }));
}

export async function generateVariantQuestion(
  originalQuestion: QuizQuestion,
  conceptName: string,
  _userId: string
): Promise<Partial<QuizQuestion>> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Reformule cette question de quiz d'histoire sur le même concept, différemment.

Question: "${originalQuestion.question}"
Options: ${originalQuestion.options.join(" | ")}
Bonne réponse: "${originalQuestion.options[originalQuestion.answer_index]}"
Concept: ${conceptName}

Génère une variante JSON (même structure, même bonne réponse possible):
{"question":"...","options":["...","...","...","..."],"answer_index":0,"explanation":"..."}`,
      },
    ],
  });

  try {
    const text =
      response.content[0].type === "text"
        ? response.content[0].text.trim()
        : "{}";
    return JSON.parse(text) as Partial<QuizQuestion>;
  } catch {
    return {};
  }
}
