import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { isValidSubject } from "@/lib/subjects";
import type { SubjectId } from "@/lib/subjects";

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

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export async function inferConceptsFromQuestion(
  question: string,
  period: string | null,
  subject?: string | null
): Promise<string[]> {
  const db = getDb();
  const client = new Anthropic();

  // Narrow to SubjectId (rejects arbitrary strings from untyped callers)
  const typedSubject: SubjectId | null =
    subject && isValidSubject(subject) ? subject : null;

  // Phase 1: fetch concepts (filtered by subject if provided)
  let query = db.from("concepts").select("id, name").order("name");
  if (typedSubject) query = query.eq("subject_enum", typedSubject);
  const { data: concepts } = await query;

  const typedConcepts = (concepts ?? []) as { id: string; name: string }[];

  if (typedConcepts.length > 0) {
    const conceptList = typedConcepts.map((c) => `- ${c.id}: ${c.name}`).join("\n");

    const phase1Response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Tu es un assistant pédagogique. Identifie les concepts liés à cette question de quiz.

Question: "${question}"
Période: ${period ?? "inconnue"}
Matière: ${typedSubject ?? "générale"}

Concepts disponibles:
${conceptList}

Réponds UNIQUEMENT avec un tableau JSON d'IDs (max 3 concepts), exemple: ["id1","id2"]
Si aucun concept ne correspond, réponds: []`,
        },
      ],
    });

    const phase1Text =
      phase1Response.content[0].type === "text"
        ? phase1Response.content[0].text.trim()
        : "[]";

    try {
      const ids = JSON.parse(stripFences(phase1Text)) as string[];
      const validIds = new Set(typedConcepts.map((c) => c.id));
      const matched = ids.filter((id) => typeof id === "string" && validIds.has(id));
      if (matched.length > 0) return matched;
    } catch {
      // fall through to phase 2 if subject is present
    }
  }

  // Legacy path: no subject → no auto-creation
  if (!typedSubject) return [];

  // Phase 2: propose and auto-create new concepts
  console.log(
    `[inferConceptsFromQuestion] Phase 2 (auto-generation) for subject=${typedSubject}, question="${question.slice(0, 60)}..."`
  );

  const phase2Response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 128,
    messages: [
      {
        role: "user",
        content: `Tu es un assistant pédagogique. Cette question de ${typedSubject} porte sur quel(s) concept(s) clé(s) ?

Question: "${question}"
Période: ${period ?? "inconnue"}

Propose 1 à 3 noms de concepts courts et précis (max 4 mots chacun).
Réponds UNIQUEMENT avec un tableau JSON de chaînes, exemple: ["Atomes","Liaisons ioniques"]
Si tu ne peux pas identifier de concept précis, réponds: []`,
      },
    ],
  });

  const phase2Text =
    phase2Response.content[0].type === "text"
      ? phase2Response.content[0].text.trim()
      : "[]";

  let proposedNames: string[] = [];
  try {
    proposedNames = JSON.parse(stripFences(phase2Text)) as string[];
  } catch {
    return [];
  }

  if (!Array.isArray(proposedNames) || proposedNames.length === 0) return [];

  const createdIds: string[] = [];

  for (const raw of proposedNames) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const name = raw.trim();

    const { data: existing } = await db
      .from("concepts")
      .select("id")
      .eq("subject_enum", typedSubject)
      .eq("name", name)
      .maybeSingle();

    if (existing) {
      createdIds.push((existing as { id: string }).id);
    } else {
      const { data: created } = await db
        .from("concepts")
        .insert({ name, subject_enum: typedSubject, category: "thème", is_auto_generated: true })
        .select("id")
        .maybeSingle();
      if (created) {
        console.log(
          `[inferConceptsFromQuestion] Created new auto-generated concept: "${name}" for subject=${typedSubject}`
        );
        createdIds.push((created as { id: string }).id);
      }
    }
  }

  return createdIds;
}
