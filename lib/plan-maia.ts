/**
 * Sprint 4 PR S4-1 — Algo pur de génération Plan Maïa quotidien.
 *
 * Mémoire `project_plan_maia_daily` :
 *   - 20 min multi-matière auto chaque matin
 *   - Pick-and-choose équilibré non-adaptatif au skip
 *
 * Mémoire `feedback_heatmap_no_overwhelm` :
 *   - Encourageant > exhaustif. Max 3-5 alertes simultanées.
 *
 * Stratégie heuristique (déterministe, pas d'IA runtime) :
 *   - 60% questions sur concepts faibles (mastery < 60% chez cet élève)
 *   - 30% questions de révision (concepts maîtrisés 70-90%, retest spaced)
 *   - 10% questions nouveau concept (jamais évalué, pour introduction progressive)
 *
 * Équilibrage matière : si plusieurs matières disponibles, on tente de prendre
 * au moins 1 question de chacune. Si une matière domine, on cap son share à 50%
 * pour préserver la diversité.
 *
 * Non-adaptatif au skip : si l'élève skip une question, on ne re-génère pas
 * le plan. Le plan est figé pour la journée (cf. mémoire).
 *
 * Sortie : `PlanQuestion[]` ordonnée pour la session, capée à `targetMinutes`
 * (estimation ~1 min/question, ajustable via difficulty).
 */

import type { SubjectId } from "@/lib/subjects";

export type QuestionCandidate = {
  id: string;
  concept_id: string | null;
  subject_enum: SubjectId | null;
  difficulty_stars: 1 | 2 | 3 | null;
  type: string;
};

export type ConceptMastery = {
  concept_id: string;
  /** Pourcentage de maîtrise 0-100, ou null si jamais évalué. */
  mastery_pct: number | null;
  /** Date de la dernière réponse pour spaced repetition (ISO ou null). */
  last_answered_at: string | null;
};

export type PlanBucket = "faible" | "revision" | "nouveau";

export type PlanQuestion = {
  question_id: string;
  bucket: PlanBucket;
  /** Justification déterministe pour le tooltip "Pourquoi cette question ?" */
  reason: string;
};

export type ConceptBreakdown = {
  faible: number;
  revision: number;
  nouveau: number;
};

export type GeneratedPlan = {
  questions: PlanQuestion[];
  conceptBreakdown: ConceptBreakdown;
  /** Stratégie utilisée pour l'algo (audit + debugging). */
  strategy: string;
  /** Estimation minutes basée sur la difficulté + nombre questions. */
  estimatedMinutes: number;
};

const DEFAULT_TARGET_QUESTIONS = 15;
const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 25;

const TARGET_RATIO_FAIBLE = 0.6;
const TARGET_RATIO_REVISION = 0.3;
const TARGET_RATIO_NOUVEAU = 0.1;

// Seuils mastery
const FAIBLE_MAX = 60;
const REVISION_MIN = 70;
const REVISION_MAX = 90;

// Cap subject diversity : aucune matière > 50% du plan si > 1 matière dispo
const SUBJECT_MAX_RATIO = 0.5;

/**
 * Estime le nombre de minutes pour répondre à une question selon sa difficulté.
 * 1 étoile = 45s, 2 étoiles = 75s, 3 étoiles = 120s. Default 60s.
 */
function estimateMinutesForQuestion(difficulty: 1 | 2 | 3 | null): number {
  if (difficulty === 1) return 0.75;
  if (difficulty === 2) return 1.25;
  if (difficulty === 3) return 2;
  return 1;
}

function bucketForMastery(masteryPct: number | null): PlanBucket | null {
  if (masteryPct === null) return "nouveau"; // jamais évalué
  if (masteryPct < FAIBLE_MAX) return "faible";
  if (masteryPct >= REVISION_MIN && masteryPct <= REVISION_MAX) return "revision";
  return null; // entre 60-70 ou > 90 : ni à retravailler ni à réviser
}

/**
 * Sélectionne les questions pour le plan quotidien d'un élève.
 *
 * @param candidates - Questions disponibles (filtrées is_active=true, etc.)
 * @param masteryByConcept - Mastery par concept pour cet élève
 * @param targetMinutes - Minutes cible (default 20)
 * @returns Plan ordonné, prêt à servir à l'élève
 */
export function selectQuestionsForPlan(
  candidates: QuestionCandidate[],
  masteryByConcept: ConceptMastery[],
  targetMinutes: number = 20,
): GeneratedPlan {
  const masteryMap = new Map<string, ConceptMastery>(
    masteryByConcept.map((m) => [m.concept_id, m]),
  );

  // 1. Classer chaque candidat dans un bucket
  type Tagged = { candidate: QuestionCandidate; bucket: PlanBucket };
  const taggedCandidates: Tagged[] = [];
  for (const c of candidates) {
    if (!c.concept_id) {
      // Question sans concept_id → bucket nouveau (par défaut)
      taggedCandidates.push({ candidate: c, bucket: "nouveau" });
      continue;
    }
    const mastery = masteryMap.get(c.concept_id);
    const bucket = bucketForMastery(mastery?.mastery_pct ?? null);
    if (bucket !== null) {
      taggedCandidates.push({ candidate: c, bucket });
    }
  }

  if (taggedCandidates.length === 0) {
    return {
      questions: [],
      conceptBreakdown: { faible: 0, revision: 0, nouveau: 0 },
      strategy: "no_candidates",
      estimatedMinutes: 0,
    };
  }

  // 2. Cible de questions selon target minutes (~1 min/question moyenne)
  const targetQuestionsRaw = Math.round(targetMinutes / 1.0);
  const targetQuestions = Math.max(
    MIN_QUESTIONS,
    Math.min(MAX_QUESTIONS, targetQuestionsRaw),
  );

  // 3. Cibles par bucket selon ratios
  const targetFaible = Math.round(targetQuestions * TARGET_RATIO_FAIBLE);
  const targetRevision = Math.round(targetQuestions * TARGET_RATIO_REVISION);
  const targetNouveau =
    targetQuestions - targetFaible - targetRevision; // reste

  // 4. Pool par bucket (déterministe : tri par concept_id puis difficulty)
  function poolFor(bucket: PlanBucket): Tagged[] {
    return taggedCandidates
      .filter((t) => t.bucket === bucket)
      .sort((a, b) => {
        const cmp = (a.candidate.concept_id ?? "").localeCompare(
          b.candidate.concept_id ?? "",
        );
        if (cmp !== 0) return cmp;
        return (a.candidate.difficulty_stars ?? 0) - (b.candidate.difficulty_stars ?? 0);
      });
  }

  const poolFaible = poolFor("faible");
  const poolRevision = poolFor("revision");
  const poolNouveau = poolFor("nouveau");

  // 5. Pick : prendre 1 question par concept_id en priorité (diversité concept)
  //    puis remplir le bucket si reste de place
  function pickDiverseConcepts(pool: Tagged[], n: number): Tagged[] {
    const seen = new Set<string>();
    const result: Tagged[] = [];
    const remaining: Tagged[] = [];
    for (const t of pool) {
      const key = t.candidate.concept_id ?? `__no_concept__${t.candidate.id}`;
      if (!seen.has(key) && result.length < n) {
        seen.add(key);
        result.push(t);
      } else {
        remaining.push(t);
      }
    }
    // Remplir avec le reste si pas assez
    for (const t of remaining) {
      if (result.length >= n) break;
      result.push(t);
    }
    return result;
  }

  const pickedFaible = pickDiverseConcepts(poolFaible, targetFaible);
  const pickedRevision = pickDiverseConcepts(poolRevision, targetRevision);
  const pickedNouveau = pickDiverseConcepts(poolNouveau, targetNouveau);

  // 6. Compensation : si un bucket est sous-rempli, compenser depuis les autres
  const allPicked = [...pickedFaible, ...pickedRevision, ...pickedNouveau];
  const totalPicked = allPicked.length;
  const deficit = targetQuestions - totalPicked;
  if (deficit > 0) {
    const allRemaining = [
      ...poolFaible.filter((t) => !pickedFaible.includes(t)),
      ...poolRevision.filter((t) => !pickedRevision.includes(t)),
      ...poolNouveau.filter((t) => !pickedNouveau.includes(t)),
    ];
    for (const t of allRemaining) {
      if (allPicked.length >= targetQuestions) break;
      allPicked.push(t);
    }
  }

  // 7. Cap subject diversity : si > 1 matière, aucune matière ne doit dépasser 50%
  const subjectCount = new Map<string, number>();
  for (const t of allPicked) {
    const subj = t.candidate.subject_enum ?? "autre";
    subjectCount.set(subj, (subjectCount.get(subj) ?? 0) + 1);
  }
  const distinctSubjects = subjectCount.size;
  let finalPicked = allPicked;
  if (distinctSubjects > 1) {
    const capPerSubject = Math.ceil(targetQuestions * SUBJECT_MAX_RATIO);
    const subjectKeep = new Map<string, number>();
    const balanced: Tagged[] = [];
    for (const t of allPicked) {
      const subj = t.candidate.subject_enum ?? "autre";
      const kept = subjectKeep.get(subj) ?? 0;
      if (kept < capPerSubject) {
        balanced.push(t);
        subjectKeep.set(subj, kept + 1);
      }
    }
    finalPicked = balanced;
  }

  // 8. Construire PlanQuestion[] avec reasons explicites
  const questions: PlanQuestion[] = finalPicked.map((t) => ({
    question_id: t.candidate.id,
    bucket: t.bucket,
    reason: reasonForBucket(t.bucket, t.candidate),
  }));

  const conceptBreakdown: ConceptBreakdown = {
    faible: questions.filter((q) => q.bucket === "faible").length,
    revision: questions.filter((q) => q.bucket === "revision").length,
    nouveau: questions.filter((q) => q.bucket === "nouveau").length,
  };

  const estimatedMinutes = Math.round(
    finalPicked.reduce(
      (sum, t) => sum + estimateMinutesForQuestion(t.candidate.difficulty_stars),
      0,
    ),
  );

  const strategy =
    distinctSubjects > 1
      ? `60/30/10 balanced (cap ${Math.round(SUBJECT_MAX_RATIO * 100)}% per subject)`
      : "60/30/10 single-subject";

  return { questions, conceptBreakdown, strategy, estimatedMinutes };
}

function reasonForBucket(bucket: PlanBucket, _q: QuestionCandidate): string {
  switch (bucket) {
    case "faible":
      return "Concept à retravailler";
    case "revision":
      return "Révision pour consolider";
    case "nouveau":
      return "Nouveau concept";
  }
}
