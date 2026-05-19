/**
 * Sprint 5 PR S5-1 — Helpers purs pour l'agrégation drill-down élève × devoir.
 *
 * Extraits de l'API `/api/classes/[id]/assignments/[assignmentId]/student/[studentId]`
 * pour testabilité. Aucun side-effect, pas de DB.
 */

export type AnswerRecord = {
  question_id: string;
  is_correct: boolean;
  created_at: string;
};

/**
 * Retourne, pour chaque question_id, la réponse la plus récente (par created_at).
 *
 * Cas edge couvert : l'élève répond plusieurs fois à la même question (retry,
 * second click). On veut le verdict final, pas un mix.
 *
 * Implémentation : `Date.parse()` pour robustesse contre les variations de
 * format ISO 8601 (Z vs +0200, fractions ms, etc.). La comparaison string
 * lexicographique fonctionnerait si Postgres sérialise toujours en UTC `Z`
 * (cas Supabase actuel), mais on évite la fragilité.
 */
export function latestAnswerByQuestion<A extends AnswerRecord>(
  answers: readonly A[],
): Map<string, A> {
  const map = new Map<string, A>();
  for (const a of answers) {
    const existing = map.get(a.question_id);
    if (!existing || Date.parse(existing.created_at) < Date.parse(a.created_at)) {
      map.set(a.question_id, a);
    }
  }
  return map;
}

/**
 * Calcule le pourcentage de réussite (0-100) à partir d'une liste de booleans.
 *
 * Retourne 0 si aucune réponse (cohérent avec mastery scale heatmap où
 * 0 = "non évalué", pas "0% de réussite"). L'UI distingue les deux états.
 *
 * Arrondi : Math.round (banker's rounding non utilisé, standard JS).
 */
export function computeMasteryPct(answers: readonly { is_correct: boolean }[]): number {
  if (answers.length === 0) return 0;
  const correct = answers.filter((a) => a.is_correct).length;
  return Math.round((100 * correct) / answers.length);
}

/**
 * Groupe les questions par concept_id, préserve l'ordre via une fonction de tri.
 *
 * `concept_id === null` → bucket séparé retourné en deuxième valeur (la heatmap
 * ne montre que les concepts mappés ; les questions orphelines ont leur propre
 * section "Questions sans concept rattaché").
 */
export function groupQuestionsByConcept<
  Q extends { concept_id: string | null; position: number },
>(
  questions: readonly Q[],
): { byConceptId: Map<string, Q[]>; orphans: Q[] } {
  const byConceptId = new Map<string, Q[]>();
  const orphans: Q[] = [];
  for (const q of questions) {
    if (q.concept_id === null) {
      orphans.push(q);
      continue;
    }
    let bucket = byConceptId.get(q.concept_id);
    if (!bucket) {
      bucket = [];
      byConceptId.set(q.concept_id, bucket);
    }
    bucket.push(q);
  }
  // Tri stable par position dans chaque bucket
  for (const bucket of byConceptId.values()) {
    bucket.sort((a, b) => a.position - b.position);
  }
  orphans.sort((a, b) => a.position - b.position);
  return { byConceptId, orphans };
}
