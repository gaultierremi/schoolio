/**
 * Sprint 4 PR S4-1 — Algo pur de génération Plan Maïa quotidien.
 *
 * Mémoire `project_plan_maia_daily` :
 *   - 20 min multi-matière auto chaque matin
 *   - Pick-and-choose équilibré non-adaptatif au skip
 *
 * Stratégie heuristique (déterministe, pas d'IA runtime) :
 *   - 60% questions sur concepts faibles (mastery < 60%)
 *     - dont sub-bucket "très faible" (< 20%) → 1-star difficulty pour ne pas
 *       décourager (I13)
 *   - 30% questions de révision (concepts 70-90%, **spaced repetition** :
 *     priorité aux concepts non-touchés depuis 7+ jours, B5)
 *   - 10% questions nouveau concept (jamais évalué)
 *
 * Équilibrage matière (B4 fix) : cap subject appliqué EN ROUND-ROBIN pendant
 * le pick, pas après. Garantit le respect de la target_questions tout en
 * respectant les ratios subject.
 *
 * Cool-down (B6) : questions répondues correctement dans les dernières 24h
 * sont exclues du pool initial (handled API-side via answeredRecentlyMap).
 *
 * Shuffle déterministe (D17) : `shuffleSeed` (hash user_id + plan_date)
 * permet d'éviter que 2 élèves côte à côte aient le même plan, tout en
 * gardant la reproducibilité pour debugging.
 *
 * Garde-fou débutant (D19) : si l'élève a < 10 réponses totales,
 * priorité absolue aux questions 1-star (`isBeginnerMode`).
 *
 * Non-adaptatif au skip : si l'élève skip une question, le plan reste figé
 * pour la journée (cf. mémoire).
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
  /** Stratégie réellement obtenue (audit + debugging). I7 fix. */
  strategy: string;
  /** Estimation minutes basée sur la difficulté + nombre questions. */
  estimatedMinutes: number;
};

export type SelectionOptions = {
  /** Target en minutes (default 20). */
  targetMinutes?: number;
  /** Seed pour shuffle déterministe (default "" = pas de shuffle, déterministe pur). */
  shuffleSeed?: string;
  /** Si élève a < 10 réponses totales → priorité 1-star (D19). */
  isBeginnerMode?: boolean;
  /** Aujourd'hui en ISO (pour calcul spaced repetition). Default Date.now(). */
  nowIso?: string;
};

const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 25;

const TARGET_RATIO_FAIBLE = 0.6;
const TARGET_RATIO_REVISION = 0.3;
// nouveau = reste (TARGET_RATIO_NOUVEAU implicite)

// Seuils mastery
const VERY_LOW_THRESHOLD = 20;
const FAIBLE_MAX = 60;
const REVISION_MIN = 70;
const REVISION_MAX = 90;

// Cap subject : aucune matière > 50% du plan si > 1 matière dispo
const SUBJECT_MAX_RATIO = 0.5;

// Spaced repetition : concept en revision pas revu depuis N jours → bonus
const SPACED_REPETITION_DAYS = 7;

/**
 * Estime le nombre de minutes pour répondre à une question selon difficulté.
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
 * FNV-1a hash 32-bit pour générer un seed numérique déterministe.
 * Utilisé pour shuffle déterministe avec une seed string (D17).
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * PRNG xorshift32 seeded — déterministe pour reproducibilité tests.
 */
function makeRng(seed: number): () => number {
  let state = seed === 0 ? 1 : seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

/**
 * Shuffle Fisher-Yates déterministe avec seed.
 */
function shuffleWithSeed<T>(arr: T[], seed: string): T[] {
  if (!seed) return arr;
  const result = arr.slice();
  const rng = makeRng(fnv1a(seed));
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Nombre de jours entre 2 dates ISO. Retourne Infinity si ref null.
 */
function daysSince(ref: string | null, nowIso: string): number {
  if (!ref) return Infinity;
  const refMs = Date.parse(ref);
  const nowMs = Date.parse(nowIso);
  if (isNaN(refMs) || isNaN(nowMs)) return Infinity;
  return (nowMs - refMs) / (1000 * 60 * 60 * 24);
}

/**
 * Sélectionne les questions pour le plan quotidien d'un élève.
 */
export function selectQuestionsForPlan(
  candidates: QuestionCandidate[],
  masteryByConcept: ConceptMastery[],
  optionsOrTargetMinutes: SelectionOptions | number = 20,
): GeneratedPlan {
  // Backward-compat : permettre l'ancien appel avec number
  const options: SelectionOptions =
    typeof optionsOrTargetMinutes === "number"
      ? { targetMinutes: optionsOrTargetMinutes }
      : optionsOrTargetMinutes;
  const targetMinutes = options.targetMinutes ?? 20;
  const shuffleSeed = options.shuffleSeed ?? "";
  const isBeginnerMode = options.isBeginnerMode ?? false;
  const nowIso = options.nowIso ?? new Date().toISOString();

  const masteryMap = new Map<string, ConceptMastery>(
    masteryByConcept.map((m) => [m.concept_id, m]),
  );

  // 1. Classer chaque candidat
  type Tagged = {
    candidate: QuestionCandidate;
    bucket: PlanBucket;
    masteryPct: number | null;
    daysSinceAnswered: number;
  };
  const taggedCandidates: Tagged[] = [];
  for (const c of candidates) {
    if (!c.concept_id) {
      taggedCandidates.push({
        candidate: c,
        bucket: "nouveau",
        masteryPct: null,
        daysSinceAnswered: Infinity,
      });
      continue;
    }
    const mastery = masteryMap.get(c.concept_id);
    const bucket = bucketForMastery(mastery?.mastery_pct ?? null);
    if (bucket !== null) {
      taggedCandidates.push({
        candidate: c,
        bucket,
        masteryPct: mastery?.mastery_pct ?? null,
        daysSinceAnswered: daysSince(mastery?.last_answered_at ?? null, nowIso),
      });
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

  // 2. Target questions
  const targetQuestions = Math.max(
    MIN_QUESTIONS,
    Math.min(MAX_QUESTIONS, Math.round(targetMinutes / 1.0)),
  );

  // 3. Cibles par bucket
  const targetFaible = Math.round(targetQuestions * TARGET_RATIO_FAIBLE);
  const targetRevision = Math.round(targetQuestions * TARGET_RATIO_REVISION);
  const targetNouveau = targetQuestions - targetFaible - targetRevision;

  // 4. Pool par bucket — ordering avec spaced repetition + beginner mode
  function poolFor(bucket: PlanBucket): Tagged[] {
    const pool = taggedCandidates.filter((t) => t.bucket === bucket);

    // Beginner mode : 1-star first (D19)
    // Spaced repetition pour revision : non-touché 7+j first (B5)
    return pool.sort((a, b) => {
      // 1. Beginner mode : 1-star first across all buckets
      if (isBeginnerMode) {
        const aStars = a.candidate.difficulty_stars ?? 2;
        const bStars = b.candidate.difficulty_stars ?? 2;
        if (aStars !== bStars) return aStars - bStars;
      }

      // 2. Spaced repetition pour revision : days_since DESC (les plus anciens d'abord)
      if (bucket === "revision") {
        if (a.daysSinceAnswered !== b.daysSinceAnswered) {
          return b.daysSinceAnswered - a.daysSinceAnswered;
        }
      }

      // 3. Très faible (<20%) : 1-star d'abord pour ne pas décourager (I13)
      if (bucket === "faible") {
        const aVeryLow = (a.masteryPct ?? 0) < VERY_LOW_THRESHOLD;
        const bVeryLow = (b.masteryPct ?? 0) < VERY_LOW_THRESHOLD;
        if (aVeryLow !== bVeryLow) return aVeryLow ? -1 : 1;
        if (aVeryLow && bVeryLow) {
          const aStars = a.candidate.difficulty_stars ?? 2;
          const bStars = b.candidate.difficulty_stars ?? 2;
          if (aStars !== bStars) return aStars - bStars;
        }
      }

      // 4. Tri stable par concept_id puis difficulty pour déterminisme
      const cmp = (a.candidate.concept_id ?? "").localeCompare(
        b.candidate.concept_id ?? "",
      );
      if (cmp !== 0) return cmp;
      return (a.candidate.difficulty_stars ?? 0) - (b.candidate.difficulty_stars ?? 0);
    });
  }

  let poolFaible = poolFor("faible");
  let poolRevision = poolFor("revision");
  let poolNouveau = poolFor("nouveau");

  // Shuffle déterministe (D17) : applique le seed sur chaque pool pour
  // disperser les questions par élève×date sans casser le determinisme.
  if (shuffleSeed) {
    poolFaible = shuffleWithSeed(poolFaible, `${shuffleSeed}:faible`);
    poolRevision = shuffleWithSeed(poolRevision, `${shuffleSeed}:revision`);
    poolNouveau = shuffleWithSeed(poolNouveau, `${shuffleSeed}:nouveau`);
  }

  // 5. Pick avec round-robin subject (B4 fix : cap pendant pick, pas après)
  const subjectsAvailable = new Set<string>();
  for (const t of [...poolFaible, ...poolRevision, ...poolNouveau]) {
    subjectsAvailable.add(t.candidate.subject_enum ?? "autre");
  }
  const hasMultipleSubjects = subjectsAvailable.size > 1;
  const capPerSubject = hasMultipleSubjects
    ? Math.ceil(targetQuestions * SUBJECT_MAX_RATIO)
    : Infinity;

  function pickWithSubjectCap(
    pool: Tagged[],
    targetCount: number,
    subjectKeep: Map<string, number>,
    seenConcepts: Set<string>,
  ): Tagged[] {
    const result: Tagged[] = [];
    // Phase A : 1 question par concept (diversité), respect cap subject
    const remaining: Tagged[] = [];
    for (const t of pool) {
      if (result.length >= targetCount) {
        remaining.push(t);
        continue;
      }
      const conceptKey = t.candidate.concept_id ?? `__no__${t.candidate.id}`;
      const subjectKey = t.candidate.subject_enum ?? "autre";
      const subjectCount = subjectKeep.get(subjectKey) ?? 0;
      if (subjectCount >= capPerSubject) {
        remaining.push(t);
        continue;
      }
      if (seenConcepts.has(conceptKey)) {
        remaining.push(t);
        continue;
      }
      seenConcepts.add(conceptKey);
      subjectKeep.set(subjectKey, subjectCount + 1);
      result.push(t);
    }
    // Phase B : remplir si pas assez, sans contrainte diversité concept
    for (const t of remaining) {
      if (result.length >= targetCount) break;
      const subjectKey = t.candidate.subject_enum ?? "autre";
      const subjectCount = subjectKeep.get(subjectKey) ?? 0;
      if (subjectCount >= capPerSubject) continue;
      subjectKeep.set(subjectKey, subjectCount + 1);
      result.push(t);
    }
    return result;
  }

  const subjectKeep = new Map<string, number>();
  const seenConcepts = new Set<string>();

  const pickedFaible = pickWithSubjectCap(
    poolFaible,
    targetFaible,
    subjectKeep,
    seenConcepts,
  );
  const pickedRevision = pickWithSubjectCap(
    poolRevision,
    targetRevision,
    subjectKeep,
    seenConcepts,
  );
  const pickedNouveau = pickWithSubjectCap(
    poolNouveau,
    targetNouveau,
    subjectKeep,
    seenConcepts,
  );

  let allPicked = [...pickedFaible, ...pickedRevision, ...pickedNouveau];

  // 6. Compensation cross-bucket si total < target (mais respect cap subject)
  const deficit = targetQuestions - allPicked.length;
  if (deficit > 0) {
    const allRemaining = [
      ...poolFaible.filter((t) => !pickedFaible.includes(t)),
      ...poolRevision.filter((t) => !pickedRevision.includes(t)),
      ...poolNouveau.filter((t) => !pickedNouveau.includes(t)),
    ];
    for (const t of allRemaining) {
      if (allPicked.length >= targetQuestions) break;
      const subjectKey = t.candidate.subject_enum ?? "autre";
      const subjectCount = subjectKeep.get(subjectKey) ?? 0;
      if (subjectCount >= capPerSubject) continue;
      subjectKeep.set(subjectKey, subjectCount + 1);
      allPicked.push(t);
    }
  }

  // 7. Construire PlanQuestion[]
  const questions: PlanQuestion[] = allPicked.map((t) => ({
    question_id: t.candidate.id,
    bucket: t.bucket,
    reason: reasonForTagged(t),
  }));

  const conceptBreakdown: ConceptBreakdown = {
    faible: questions.filter((q) => q.bucket === "faible").length,
    revision: questions.filter((q) => q.bucket === "revision").length,
    nouveau: questions.filter((q) => q.bucket === "nouveau").length,
  };

  const estimatedMinutes = Math.round(
    allPicked.reduce(
      (sum, t) => sum + estimateMinutesForQuestion(t.candidate.difficulty_stars),
      0,
    ),
  );

  // I7 fix : strategy reflète le RATIO RÉEL obtenu, pas la cible
  const total = questions.length || 1;
  const pctFaible = Math.round((conceptBreakdown.faible / total) * 100);
  const pctRevision = Math.round((conceptBreakdown.revision / total) * 100);
  const pctNouveau = Math.round((conceptBreakdown.nouveau / total) * 100);
  const strategyParts: string[] = [`${pctFaible}/${pctRevision}/${pctNouveau} actual`];
  if (hasMultipleSubjects) strategyParts.push(`cap ${capPerSubject}/subject`);
  if (isBeginnerMode) strategyParts.push("beginner mode");
  if (shuffleSeed) strategyParts.push("shuffled");
  const strategy = strategyParts.join(", ");

  return { questions, conceptBreakdown, strategy, estimatedMinutes };
}

/**
 * Raison déterministe pour le tooltip "Pourquoi cette question ?"
 * I14 fix : signature simplifiée, contexte enrichi.
 */
function reasonForTagged(t: {
  candidate: QuestionCandidate;
  bucket: PlanBucket;
  masteryPct: number | null;
  daysSinceAnswered: number;
}): string {
  if (t.bucket === "faible") {
    if ((t.masteryPct ?? 0) < VERY_LOW_THRESHOLD) {
      return "Concept à reprendre du début";
    }
    return "Concept à retravailler";
  }
  if (t.bucket === "revision") {
    if (t.daysSinceAnswered >= SPACED_REPETITION_DAYS) {
      return `Révision (pas revu depuis ${Math.round(t.daysSinceAnswered)} jours)`;
    }
    return "Révision pour consolider";
  }
  return "Nouveau concept";
}
