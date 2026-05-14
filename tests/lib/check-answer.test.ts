import { describe, it, expect } from "vitest";
import { checkAnswer } from "../../lib/grading/check-answer";

describe("checkAnswer", () => {
  // 1. mcq — strict equality
  it("mcq: is_correct when index matches", () => {
    const q = { type: "mcq" as const, answer_index: 2 };
    expect(checkAnswer(q, 2).is_correct).toBe(true);
  });

  it("mcq: is_correct=false when index differs", () => {
    const q = { type: "mcq" as const, answer_index: 2 };
    expect(checkAnswer(q, 1).is_correct).toBe(false);
  });

  // 2. numeric — within tolerance
  it("numeric: is_correct when diff <= tolerance", () => {
    const q = {
      type: "numeric" as const,
      expected_numeric_answer: 9.81,
      numeric_tolerance: 0.05,
    };
    expect(checkAnswer(q, 9.83).is_correct).toBe(true);
  });

  // 3. numeric — outside tolerance
  it("numeric: is_correct=false when diff > tolerance", () => {
    const q = {
      type: "numeric" as const,
      expected_numeric_answer: 9.81,
      numeric_tolerance: 0.05,
    };
    expect(checkAnswer(q, 10.0).is_correct).toBe(false);
  });

  // 4. short_text — exact match
  it("short_text: is_correct on exact match", () => {
    const q = {
      type: "short_text" as const,
      expected_text_answers: ["photosynthèse"],
    };
    expect(checkAnswer(q, "photosynthèse").is_correct).toBe(true);
  });

  // 5. short_text — accent normalization
  it("short_text: is_correct across accent variants (école / ecole / ÉCOLE)", () => {
    const q = {
      type: "short_text" as const,
      expected_text_answers: ["école"],
    };
    expect(checkAnswer(q, "ecole").is_correct).toBe(true);
    expect(checkAnswer(q, "ÉCOLE").is_correct).toBe(true);
    expect(checkAnswer(q, "École").is_correct).toBe(true);
  });

  // 6. short_text — wrong answer
  it("short_text: is_correct=false for wrong answer", () => {
    const q = {
      type: "short_text" as const,
      expected_text_answers: ["photosynthèse"],
    };
    expect(checkAnswer(q, "respiration").is_correct).toBe(false);
  });

  // 7. truefalse — index 1 (true)
  it("truefalse: is_correct for index 1", () => {
    const q = { type: "truefalse" as const, answer_index: 1 };
    expect(checkAnswer(q, 1).is_correct).toBe(true);
    expect(checkAnswer(q, 0).is_correct).toBe(false);
  });

  // 8. multi_step — deferred
  it("multi_step: returns is_correct=false with error message", () => {
    const q = { type: "multi_step" as const };
    const result = checkAnswer(q, "anything");
    expect(result.is_correct).toBe(false);
    expect("error" in result).toBe(true);
  });

  // 9. numeric — default tolerance (0.01) when not configured
  it("numeric: uses default tolerance of 0.01 when numeric_tolerance is null", () => {
    const q = {
      type: "numeric" as const,
      expected_numeric_answer: 3.14,
      numeric_tolerance: null,
    };
    // 3.14 + 0.005 = 3.145 → diff 0.005 ≤ 0.01 → correct
    expect(checkAnswer(q, 3.145).is_correct).toBe(true);
    // 3.14 + 0.02 = 3.16 → diff 0.02 > 0.01 → incorrect
    expect(checkAnswer(q, 3.16).is_correct).toBe(false);
    // exact match → correct
    expect(checkAnswer(q, 3.14).is_correct).toBe(true);
  });
});
