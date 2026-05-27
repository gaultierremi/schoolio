/**
 * Concept linker — propose un concept_id pour chaque question via Claude Haiku.
 *
 * Pourquoi : Pipeline A (extract-questions) inserait des `teacher_questions`
 * SANS `concept_id` → curation par concept vide, heatmap empty state, Plan
 * Maïa mastery par concept incalculable. Feedback Alex 2026-05-25.
 *
 * Stratégie hybride (confidence-based) :
 * - ≥ 0.85 : auto-apply (UPDATE concept_id direct)
 * - 0.5 – 0.85 : review pending (PR 2 — pour l'instant skip)
 * - < 0.5 : skip définitif (NULL — pas pertinent)
 *
 * Coût Haiku : ~$0.013 / batch de 20 questions sur 30 concepts (~$0.07 pour
 * un syllabus de 100 questions). Largement abordable pour pilotes 2026.
 */

import Anthropic from "@anthropic-ai/sdk";

export type ConceptForLinking = {
  id: string;
  name: string;
  description: string | null;
  uaa_name?: string | null;
};

export type QuestionForLinking = {
  id: string;
  question: string;
};

export type LinkProposal = {
  question_id: string;
  concept_id: string | null;
  confidence: number;
  reason: string;
  action: "auto_apply" | "review" | "skip";
};

export const AUTO_APPLY_THRESHOLD = 0.85;
export const REVIEW_THRESHOLD = 0.5;
export const BATCH_SIZE = 20;

/**
 * Pure function — détermine l'action en fonction du confidence + concept_id.
 * Testable sans appel réseau.
 */
export function categorizeAction(
  confidence: number,
  conceptId: string | null,
): "auto_apply" | "review" | "skip" {
  if (!conceptId) return "skip";
  if (confidence >= AUTO_APPLY_THRESHOLD) return "auto_apply";
  if (confidence >= REVIEW_THRESHOLD) return "review";
  return "skip";
}

/**
 * Appelle Claude Haiku en batch pour proposer un concept_id pour chaque question.
 * Renvoie un tableau de propositions, une par question d'entrée.
 *
 * En cas d'erreur de parsing, retourne action="skip" pour la batch concernée
 * (graceful degradation — le prof pourra retry).
 */
export async function proposeConceptLinks(
  questions: QuestionForLinking[],
  concepts: ConceptForLinking[],
): Promise<LinkProposal[]> {
  if (questions.length === 0 || concepts.length === 0) return [];

  const client = new Anthropic();
  const results: LinkProposal[] = [];

  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);
    try {
      const proposals = await proposeBatch(client, batch, concepts);
      results.push(...proposals);
    } catch (err) {
      console.error("[concept-linker] batch failed", err);
      // Graceful : skip cette batch, le prof pourra relancer
      for (const q of batch) {
        results.push({
          question_id: q.id,
          concept_id: null,
          confidence: 0,
          reason: "Erreur de classification (réessayer plus tard)",
          action: "skip",
        });
      }
    }
  }

  return results;
}

async function proposeBatch(
  client: Anthropic,
  questions: QuestionForLinking[],
  concepts: ConceptForLinking[],
): Promise<LinkProposal[]> {
  const conceptsText = concepts
    .map((c) => {
      const desc = c.description ? ` — ${c.description.slice(0, 200)}` : "";
      const uaa = c.uaa_name ? ` (UAA: ${c.uaa_name})` : "";
      return `[${c.id}] ${c.name}${uaa}${desc}`;
    })
    .join("\n");

  const questionsText = questions
    .map((q, i) => `Q${i + 1} [id:${q.id}]: ${q.question.slice(0, 400)}`)
    .join("\n");

  const prompt = `Tu es un assistant pédagogique. Classe chaque question dans le concept du syllabus le plus pertinent.

# Concepts disponibles
${conceptsText}

# Questions à classer
${questionsText}

# Règles
- Pour chaque question, retourne le concept_id le plus adapté ou null si aucun concept ne convient clairement.
- Donne une confidence entre 0 et 1 :
  * 0.9-1.0 = match certain (le concept couvre exactement le sujet de la question)
  * 0.7-0.9 = match probable (la question s'inscrit dans le thème du concept)
  * 0.5-0.7 = match plausible mais ambigu
  * 0.0-0.5 = match faible → préférer concept_id = null
- "reason" : 1 phrase courte (max 80 chars) expliquant ton choix.
- Si plusieurs concepts pourraient convenir, choisis le plus spécifique.

# Format de sortie
JSON strict, sans markdown fences, sans préambule :
{
  "links": [
    { "question_id": "...", "concept_id": "..." | null, "confidence": 0.92, "reason": "..." }
  ]
}`;

  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });
  const completion = await stream.finalMessage();
  const firstBlock = completion.content[0];
  const text = firstBlock && firstBlock.type === "text" ? firstBlock.text : "";

  let parsed: {
    links: Array<{
      question_id: string;
      concept_id: string | null;
      confidence: number;
      reason: string;
    }>;
  };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Haiku response not parseable as JSON");
    parsed = JSON.parse(match[0]) as typeof parsed;
  }

  // Validation défensive : filtre les question_ids qui sont dans la batch
  const batchIds = new Set(questions.map((q) => q.id));
  const validConceptIds = new Set(concepts.map((c) => c.id));
  const proposals: LinkProposal[] = [];

  for (const q of questions) {
    const found = (parsed.links ?? []).find((l) => l.question_id === q.id);
    if (!found) {
      proposals.push({
        question_id: q.id,
        concept_id: null,
        confidence: 0,
        reason: "Haiku n'a pas répondu pour cette question",
        action: "skip",
      });
      continue;
    }
    // Confidence clamp + concept_id whitelist
    const confidence = Math.max(0, Math.min(1, Number(found.confidence) || 0));
    const conceptId =
      found.concept_id && validConceptIds.has(found.concept_id) ? found.concept_id : null;
    proposals.push({
      question_id: q.id,
      concept_id: conceptId,
      confidence,
      reason: (found.reason ?? "").slice(0, 200),
      action: categorizeAction(confidence, conceptId),
    });
  }

  return proposals;
}
