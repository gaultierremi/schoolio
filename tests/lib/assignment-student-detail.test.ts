import { describe, it, expect } from "vitest";
import {
  computeMasteryPct,
  groupQuestionsByConcept,
  latestAnswerByQuestion,
} from "@/lib/assignment-student-detail";

describe("latestAnswerByQuestion", () => {
  it("returns empty map for empty input", () => {
    expect(latestAnswerByQuestion([]).size).toBe(0);
  });

  it("keeps single answer per question", () => {
    const answers = [
      { question_id: "q1", is_correct: true, created_at: "2026-05-19T10:00:00Z" },
      { question_id: "q2", is_correct: false, created_at: "2026-05-19T10:05:00Z" },
    ];
    const map = latestAnswerByQuestion(answers);
    expect(map.size).toBe(2);
    expect(map.get("q1")?.is_correct).toBe(true);
    expect(map.get("q2")?.is_correct).toBe(false);
  });

  it("keeps latest answer when same question answered multiple times (retry)", () => {
    const answers = [
      { question_id: "q1", is_correct: false, created_at: "2026-05-19T10:00:00Z" }, // 1ère tentative
      { question_id: "q1", is_correct: true, created_at: "2026-05-19T10:30:00Z" }, // retry réussi
    ];
    const map = latestAnswerByQuestion(answers);
    expect(map.size).toBe(1);
    expect(map.get("q1")?.is_correct).toBe(true);
    expect(map.get("q1")?.created_at).toBe("2026-05-19T10:30:00Z");
  });

  it("handles unordered input (later timestamp first in array)", () => {
    const answers = [
      { question_id: "q1", is_correct: true, created_at: "2026-05-19T10:30:00Z" },
      { question_id: "q1", is_correct: false, created_at: "2026-05-19T10:00:00Z" },
    ];
    const map = latestAnswerByQuestion(answers);
    expect(map.get("q1")?.is_correct).toBe(true);
  });

  it("handles ms precision (Z format, Supabase normal case)", () => {
    const answers = [
      { question_id: "q1", is_correct: false, created_at: "2026-05-19T22:00:00.123Z" },
      { question_id: "q1", is_correct: true, created_at: "2026-05-19T22:00:00.456Z" }, // 333ms après
    ];
    const map = latestAnswerByQuestion(answers);
    expect(map.get("q1")?.is_correct).toBe(true);
  });

  it("handles cross-offset timestamps (anti-fragile via Date.parse)", () => {
    // Si jamais une source écrit en offset local au lieu de Z (hypothétique),
    // Date.parse normalise vers epoch ms → comparaison fiable.
    // 22:00 UTC = 23:00 en CET (+0100) → même instant, mais string lexicographique
    // dirait l'inverse. Date.parse les ramène au même epoch.
    const answers = [
      // T1 : 22:30 UTC = "22:30:00Z"
      { question_id: "q1", is_correct: false, created_at: "2026-05-19T22:30:00Z" },
      // T2 : 23:00 UTC, exprimé en +0100 = "00:00:00+0100" → STRING lex < T1 mais
      // epoch ms > T1.
      { question_id: "q1", is_correct: true, created_at: "2026-05-20T00:00:00+0100" },
    ];
    const map = latestAnswerByQuestion(answers);
    expect(map.get("q1")?.is_correct).toBe(true);
  });
});

describe("computeMasteryPct", () => {
  it("returns 0 for empty input (cohérent avec mastery scale 'non évalué')", () => {
    expect(computeMasteryPct([])).toBe(0);
  });

  it("returns 100 when all correct", () => {
    expect(computeMasteryPct([{ is_correct: true }, { is_correct: true }])).toBe(100);
  });

  it("returns 0 when all incorrect", () => {
    expect(computeMasteryPct([{ is_correct: false }, { is_correct: false }])).toBe(0);
  });

  it("returns 50 for 1/2", () => {
    expect(computeMasteryPct([{ is_correct: true }, { is_correct: false }])).toBe(50);
  });

  it("rounds 2/3 to 67 (Math.round, pas floor)", () => {
    expect(
      computeMasteryPct([
        { is_correct: true },
        { is_correct: true },
        { is_correct: false },
      ]),
    ).toBe(67);
  });

  it("rounds 1/3 to 33", () => {
    expect(
      computeMasteryPct([
        { is_correct: true },
        { is_correct: false },
        { is_correct: false },
      ]),
    ).toBe(33);
  });

  it("handles 1 single correct answer = 100%", () => {
    expect(computeMasteryPct([{ is_correct: true }])).toBe(100);
  });
});

describe("groupQuestionsByConcept", () => {
  it("returns empty groups for empty input", () => {
    const result = groupQuestionsByConcept([]);
    expect(result.byConceptId.size).toBe(0);
    expect(result.orphans).toEqual([]);
  });

  it("groups by concept_id", () => {
    const questions = [
      { id: "q1", concept_id: "c1", position: 1 },
      { id: "q2", concept_id: "c1", position: 2 },
      { id: "q3", concept_id: "c2", position: 3 },
    ];
    const result = groupQuestionsByConcept(questions);
    expect(result.byConceptId.size).toBe(2);
    expect(result.byConceptId.get("c1")).toHaveLength(2);
    expect(result.byConceptId.get("c2")).toHaveLength(1);
    expect(result.orphans).toHaveLength(0);
  });

  it("separates orphans (concept_id null)", () => {
    const questions = [
      { id: "q1", concept_id: "c1", position: 1 },
      { id: "q2", concept_id: null, position: 2 },
      { id: "q3", concept_id: null, position: 3 },
    ];
    const result = groupQuestionsByConcept(questions);
    expect(result.byConceptId.size).toBe(1);
    expect(result.orphans).toHaveLength(2);
    expect(result.orphans.map((q) => q.id)).toEqual(["q2", "q3"]);
  });

  it("sorts each concept bucket by position ascending", () => {
    const questions = [
      { id: "q3", concept_id: "c1", position: 3 },
      { id: "q1", concept_id: "c1", position: 1 },
      { id: "q2", concept_id: "c1", position: 2 },
    ];
    const result = groupQuestionsByConcept(questions);
    expect(result.byConceptId.get("c1")?.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
  });

  it("sorts orphans by position too", () => {
    const questions = [
      { id: "q3", concept_id: null, position: 3 },
      { id: "q1", concept_id: null, position: 1 },
    ];
    const result = groupQuestionsByConcept(questions);
    expect(result.orphans.map((q) => q.id)).toEqual(["q1", "q3"]);
  });
});
