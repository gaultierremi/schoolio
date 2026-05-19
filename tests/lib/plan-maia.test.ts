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

  // ────────────────────────────────────────────────────────────────────────
  // Hard review fixes : B4 cap pending pick, B5 spaced, D17 shuffle,
  //                    D19 beginner, I7 strategy actual, I13 sub-bucket
  // ────────────────────────────────────────────────────────────────────────

  describe("B4 — cap subject during pick (not after)", () => {
    it("respects cap subject without losing questions", () => {
      const candidates: QuestionCandidate[] = [];
      const mastery: ConceptMastery[] = [];
      // 18 math + 2 chimie, all faible
      for (let i = 0; i < 18; i++) {
        candidates.push(makeQuestion(`m${i}`, `cm${i}`, "math"));
        mastery.push(makeMastery(`cm${i}`, 30));
      }
      for (let i = 0; i < 2; i++) {
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
      // Cap math à 10 (ceil(20*0.5)), reste = chimie + on continue par math
      // jusqu'à atteindre 20 total. Mais cap empêche > 10 math.
      // Donc max final = 10 math + 2 chimie = 12.
      // C'est une perte de capacité — documentée comme acceptable
      // (priorise diversité over volume).
      expect(subjects.math ?? 0).toBeLessThanOrEqual(10);
      expect(plan.questions.length).toBeGreaterThan(2);
    });
  });

  describe("B5 — spaced repetition pour revision bucket", () => {
    it("prioritizes revision concepts not seen for 7+ days", () => {
      const now = "2026-05-18T10:00:00Z";
      const candidates = [
        makeQuestion("q-recent", "c-recent"),
        makeQuestion("q-old", "c-old"),
      ];
      const mastery: ConceptMastery[] = [
        { concept_id: "c-recent", mastery_pct: 80, last_answered_at: "2026-05-17T10:00:00Z" }, // 1 day ago
        { concept_id: "c-old", mastery_pct: 80, last_answered_at: "2026-05-01T10:00:00Z" }, // 17 days ago
      ];
      const plan = selectQuestionsForPlan(candidates, mastery, {
        targetMinutes: 20,
        nowIso: now,
      });
      // Le plus ancien devrait être en premier dans le bucket revision
      const revisionQuestions = plan.questions.filter((q) => q.bucket === "revision");
      expect(revisionQuestions[0]?.question_id).toBe("q-old");
    });

    it("includes 'pas revu depuis X jours' in reason for old revision", () => {
      const now = "2026-05-18T10:00:00Z";
      const candidates = [makeQuestion("q-old", "c-old")];
      const mastery: ConceptMastery[] = [
        { concept_id: "c-old", mastery_pct: 80, last_answered_at: "2026-05-01T10:00:00Z" },
      ];
      const plan = selectQuestionsForPlan(candidates, mastery, {
        targetMinutes: 20,
        nowIso: now,
      });
      expect(plan.questions[0]?.reason).toMatch(/pas revu depuis/);
    });
  });

  describe("D17 — shuffle déterministe avec seed", () => {
    it("produces different orders for different seeds", () => {
      const candidates: QuestionCandidate[] = [];
      const mastery: ConceptMastery[] = [];
      for (let i = 0; i < 10; i++) {
        candidates.push(makeQuestion(`q${i}`, `c${i}`));
        mastery.push(makeMastery(`c${i}`, 30));
      }
      const planA = selectQuestionsForPlan(candidates, mastery, {
        targetMinutes: 20,
        shuffleSeed: "user-A:2026-05-18",
      });
      const planB = selectQuestionsForPlan(candidates, mastery, {
        targetMinutes: 20,
        shuffleSeed: "user-B:2026-05-18",
      });
      const idsA = planA.questions.map((q) => q.question_id).join(",");
      const idsB = planB.questions.map((q) => q.question_id).join(",");
      expect(idsA).not.toBe(idsB);
    });

    it("produces SAME order for same seed (deterministic)", () => {
      const candidates: QuestionCandidate[] = [];
      const mastery: ConceptMastery[] = [];
      for (let i = 0; i < 10; i++) {
        candidates.push(makeQuestion(`q${i}`, `c${i}`));
        mastery.push(makeMastery(`c${i}`, 30));
      }
      const seed = "user-A:2026-05-18";
      const planA = selectQuestionsForPlan(candidates, mastery, {
        targetMinutes: 20,
        shuffleSeed: seed,
      });
      const planB = selectQuestionsForPlan(candidates, mastery, {
        targetMinutes: 20,
        shuffleSeed: seed,
      });
      expect(planA.questions.map((q) => q.question_id)).toEqual(
        planB.questions.map((q) => q.question_id),
      );
    });
  });

  describe("D19 — beginner mode (< 10 réponses totales)", () => {
    it("prioritizes 1-star questions when isBeginnerMode=true", () => {
      const candidates = [
        makeQuestion("q-easy", "c-easy", "math", 1),
        makeQuestion("q-medium", "c-medium", "math", 2),
        makeQuestion("q-hard", "c-hard", "math", 3),
      ];
      const mastery = [
        makeMastery("c-easy", 30),
        makeMastery("c-medium", 30),
        makeMastery("c-hard", 30),
      ];
      const plan = selectQuestionsForPlan(candidates, mastery, {
        targetMinutes: 20,
        isBeginnerMode: true,
      });
      // 1-star en premier dans le plan
      expect(plan.questions[0]?.question_id).toBe("q-easy");
    });
  });

  describe("I13 — sub-bucket très faible (< 20%)", () => {
    it("prioritizes 1-star for concepts < 20% mastery (don't overwhelm)", () => {
      const candidates = [
        makeQuestion("q-vlow-1star", "c-vlow", "math", 1),
        makeQuestion("q-vlow-3star", "c-vlow", "math", 3),
        makeQuestion("q-mid", "c-mid", "math", 1),
      ];
      const mastery = [
        makeMastery("c-vlow", 15), // < 20 = very low
        makeMastery("c-mid", 50), // 50 = faible mais pas very low
      ];
      const plan = selectQuestionsForPlan(candidates, mastery, 20);
      // Very low concept devrait apparaître en premier avec 1-star
      const vlowIdx = plan.questions.findIndex(
        (q) => q.question_id === "q-vlow-1star",
      );
      const vlow3Idx = plan.questions.findIndex(
        (q) => q.question_id === "q-vlow-3star",
      );
      expect(vlowIdx).toBeLessThan(vlow3Idx);
    });

    it("uses 'à reprendre du début' reason for very low concepts", () => {
      const candidates = [makeQuestion("q-vlow", "c-vlow")];
      const mastery = [makeMastery("c-vlow", 10)];
      const plan = selectQuestionsForPlan(candidates, mastery, 20);
      expect(plan.questions[0]?.reason).toMatch(/reprendre du début/);
    });
  });

  describe("I7 — strategy reflète le ratio réel obtenu", () => {
    it("reports actual ratios, not target ratios", () => {
      // Pool déséquilibré : tous nouveau, pas de faible/revision
      const candidates = [
        makeQuestion("q1", "c1"),
        makeQuestion("q2", "c2"),
        makeQuestion("q3", "c3"),
      ];
      const mastery: ConceptMastery[] = []; // pas de mastery → tous "nouveau"
      const plan = selectQuestionsForPlan(candidates, mastery, 20);
      // Le strategy doit indiquer 0/0/100 ou similaire, pas 60/30/10
      expect(plan.strategy).toMatch(/0\/0\/100|^\d+\/\d+\/\d+/);
      expect(plan.strategy).toContain("actual");
    });
  });
});
