import { describe, it, expect } from "vitest";
import {
  selectQuestionsForPlan,
  type QuestionCandidate,
  type ConceptMastery,
} from "@/lib/plan-maia";

function makeQuestion(
  id: string,
  concept_id: string | null,
  subject_enum: string | null = "math",
  difficulty_stars: 1 | 2 | 3 | null = 2,
): QuestionCandidate {
  return {
    id,
    concept_id,
    subject_enum: subject_enum as QuestionCandidate["subject_enum"],
    difficulty_stars,
    type: "mcq",
  };
}

function makeMastery(concept_id: string, pct: number | null): ConceptMastery {
  return { concept_id, mastery_pct: pct, last_answered_at: null };
}

describe("selectQuestionsForPlan", () => {
  it("returns empty plan when no candidates", () => {
    const plan = selectQuestionsForPlan([], [], 20);
    expect(plan.questions).toHaveLength(0);
    expect(plan.strategy).toBe("no_candidates");
    expect(plan.estimatedMinutes).toBe(0);
  });

  it("classifies questions into buckets based on mastery thresholds", () => {
    const candidates = [
      makeQuestion("q-faible-1", "c-faible"),
      makeQuestion("q-faible-2", "c-faible"),
      makeQuestion("q-revision", "c-revision"),
      makeQuestion("q-nouveau", "c-jamais-vu"),
    ];
    const mastery = [
      makeMastery("c-faible", 30), // < 60 → faible
      makeMastery("c-revision", 80), // 70-90 → revision
      // c-jamais-vu = absent → nouveau
    ];
    const plan = selectQuestionsForPlan(candidates, mastery, 20);
    const buckets = plan.questions.map((q) => q.bucket);
    expect(buckets).toContain("faible");
    expect(buckets).toContain("revision");
    expect(buckets).toContain("nouveau");
  });

  it("skips concepts with mastery 60-70 or > 90 (not faible, not revision range)", () => {
    const candidates = [
      makeQuestion("q-gap", "c-gap"), // mastery 65 → entre 60-70, skip
      makeQuestion("q-master", "c-master"), // mastery 95 → > 90, skip
      makeQuestion("q-faible", "c-faible"),
    ];
    const mastery = [
      makeMastery("c-gap", 65),
      makeMastery("c-master", 95),
      makeMastery("c-faible", 30),
    ];
    const plan = selectQuestionsForPlan(candidates, mastery, 20);
    const includedIds = plan.questions.map((q) => q.question_id);
    expect(includedIds).toContain("q-faible");
    expect(includedIds).not.toContain("q-gap");
    expect(includedIds).not.toContain("q-master");
  });

  it("respects approx 60/30/10 ratios on a balanced pool", () => {
    // 30 candidates, 10 par bucket
    const candidates: QuestionCandidate[] = [];
    const mastery: ConceptMastery[] = [];
    for (let i = 0; i < 10; i++) {
      candidates.push(makeQuestion(`f${i}`, `cf${i}`));
      mastery.push(makeMastery(`cf${i}`, 30));
    }
    for (let i = 0; i < 10; i++) {
      candidates.push(makeQuestion(`r${i}`, `cr${i}`));
      mastery.push(makeMastery(`cr${i}`, 80));
    }
    for (let i = 0; i < 10; i++) {
      candidates.push(makeQuestion(`n${i}`, `cn${i}`));
      // pas dans mastery → nouveau
    }
    const plan = selectQuestionsForPlan(candidates, mastery, 20);
    expect(plan.conceptBreakdown.faible).toBeGreaterThanOrEqual(8); // ~60%
    expect(plan.conceptBreakdown.revision).toBeGreaterThanOrEqual(3); // ~30%
    expect(plan.conceptBreakdown.nouveau).toBeGreaterThanOrEqual(1); // ~10%
  });

  it("caps any single subject at ceil(targetQuestions/2) when multiple subjects available", () => {
    const candidates: QuestionCandidate[] = [];
    const mastery: ConceptMastery[] = [];
    // 20 questions math, 5 chimie, toutes faibles
    for (let i = 0; i < 20; i++) {
      candidates.push(makeQuestion(`m${i}`, `cm${i}`, "math"));
      mastery.push(makeMastery(`cm${i}`, 30));
    }
    for (let i = 0; i < 5; i++) {
      candidates.push(makeQuestion(`c${i}`, `cc${i}`, "chimie"));
      mastery.push(makeMastery(`cc${i}`, 30));
    }
    const plan = selectQuestionsForPlan(candidates, mastery, 20);
    const subjects: Record<string, number> = {};
    for (const q of plan.questions) {
      const candidate = candidates.find((c) => c.id === q.question_id)!;
      const subj = candidate.subject_enum ?? "autre";
      subjects[subj] = (subjects[subj] ?? 0) + 1;
    }
    // Aucune matière ne doit dépasser ceil(target × 0.5) absolu = 10
    // (cap absolu pour stabilité — un cap relatif post-pick serait itératif)
    if (Object.keys(subjects).length > 1) {
      for (const count of Object.values(subjects)) {
        expect(count).toBeLessThanOrEqual(10);
      }
    }
  });

  it("preserves diversity by picking 1 question per concept first", () => {
    // 10 questions sur 3 concepts (4+3+3)
    const candidates: QuestionCandidate[] = [];
    const mastery: ConceptMastery[] = [];
    for (let i = 0; i < 4; i++) {
      candidates.push(makeQuestion(`a${i}`, "concept-A"));
    }
    for (let i = 0; i < 3; i++) {
      candidates.push(makeQuestion(`b${i}`, "concept-B"));
    }
    for (let i = 0; i < 3; i++) {
      candidates.push(makeQuestion(`c${i}`, "concept-C"));
    }
    mastery.push(makeMastery("concept-A", 30));
    mastery.push(makeMastery("concept-B", 30));
    mastery.push(makeMastery("concept-C", 30));

    const plan = selectQuestionsForPlan(candidates, mastery, 20);
    const conceptsPicked = new Set<string>();
    for (const q of plan.questions) {
      const cand = candidates.find((c) => c.id === q.question_id)!;
      conceptsPicked.add(cand.concept_id!);
    }
    // Les 3 concepts doivent être représentés
    expect(conceptsPicked.size).toBe(3);
  });

  it("estimates minutes based on difficulty distribution", () => {
    const candidates = [
      makeQuestion("q1", "c1", "math", 1), // 0.75 min
      makeQuestion("q2", "c2", "math", 2), // 1.25 min
      makeQuestion("q3", "c3", "math", 3), // 2 min
      makeQuestion("q4", "c4", "math", 2), // 1.25 min
      makeQuestion("q5", "c5", "math", 2), // 1.25 min
    ];
    const mastery = candidates.map((c) => makeMastery(c.concept_id!, 30));
    const plan = selectQuestionsForPlan(candidates, mastery, 20);
    // Tout faible, donc tous pris dans le bucket faible (jusqu'à 60% × 20 = 12)
    expect(plan.estimatedMinutes).toBeGreaterThan(0);
    expect(plan.estimatedMinutes).toBeLessThan(40);
  });

  it("returns deterministic results (same input = same output)", () => {
    const candidates = [
      makeQuestion("q1", "c1", "math", 2),
      makeQuestion("q2", "c2", "chimie", 2),
      makeQuestion("q3", "c3", "math", 2),
    ];
    const mastery = candidates.map((c) => makeMastery(c.concept_id!, 30));
    const plan1 = selectQuestionsForPlan(candidates, mastery, 20);
    const plan2 = selectQuestionsForPlan(candidates, mastery, 20);
    expect(plan1.questions.map((q) => q.question_id)).toEqual(
      plan2.questions.map((q) => q.question_id),
    );
  });

  it("handles questions without concept_id as 'nouveau'", () => {
    const candidates = [
      makeQuestion("q-no-concept", null),
      makeQuestion("q-faible", "c-faible"),
    ];
    const mastery = [makeMastery("c-faible", 30)];
    const plan = selectQuestionsForPlan(candidates, mastery, 20);
    const noConceptQ = plan.questions.find((q) => q.question_id === "q-no-concept");
    expect(noConceptQ?.bucket).toBe("nouveau");
  });

  it("respects MIN_QUESTIONS=5 minimum even at low target minutes", () => {
    const candidates: QuestionCandidate[] = [];
    const mastery: ConceptMastery[] = [];
    for (let i = 0; i < 10; i++) {
      candidates.push(makeQuestion(`q${i}`, `c${i}`));
      mastery.push(makeMastery(`c${i}`, 30));
    }
    const plan = selectQuestionsForPlan(candidates, mastery, 1); // 1 min cible
    expect(plan.questions.length).toBeGreaterThanOrEqual(5);
  });

  it("provides a reason for each plan question", () => {
    const candidates = [
      makeQuestion("q-f", "c-f"),
      makeQuestion("q-r", "c-r"),
      makeQuestion("q-n", "c-n"),
    ];
    const mastery = [makeMastery("c-f", 30), makeMastery("c-r", 80)];
    const plan = selectQuestionsForPlan(candidates, mastery, 20);
    for (const q of plan.questions) {
      expect(q.reason).toBeTruthy();
      expect(q.reason.length).toBeGreaterThan(5);
    }
  });
});
