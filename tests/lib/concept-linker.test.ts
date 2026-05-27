import { describe, it, expect } from "vitest";
import {
  AUTO_APPLY_THRESHOLD,
  REVIEW_THRESHOLD,
  categorizeAction,
} from "@/lib/concept-linker";

describe("categorizeAction", () => {
  it("returns auto_apply for high confidence with concept_id", () => {
    expect(categorizeAction(0.95, "concept-1")).toBe("auto_apply");
    expect(categorizeAction(AUTO_APPLY_THRESHOLD, "concept-1")).toBe("auto_apply");
    expect(categorizeAction(1.0, "concept-1")).toBe("auto_apply");
  });

  it("returns review for medium confidence with concept_id", () => {
    expect(categorizeAction(0.7, "concept-1")).toBe("review");
    expect(categorizeAction(REVIEW_THRESHOLD, "concept-1")).toBe("review");
    expect(categorizeAction(0.84, "concept-1")).toBe("review");
  });

  it("returns skip for low confidence", () => {
    expect(categorizeAction(0.4, "concept-1")).toBe("skip");
    expect(categorizeAction(0, "concept-1")).toBe("skip");
  });

  it("returns skip when concept_id is null regardless of confidence", () => {
    expect(categorizeAction(1.0, null)).toBe("skip");
    expect(categorizeAction(0.5, null)).toBe("skip");
    expect(categorizeAction(0, null)).toBe("skip");
  });

  it("uses exact threshold boundaries (inclusive)", () => {
    // 0.85 → auto_apply (>=)
    expect(categorizeAction(0.85, "c")).toBe("auto_apply");
    // 0.849999 → review (<0.85)
    expect(categorizeAction(0.849, "c")).toBe("review");
    // 0.5 → review (>=)
    expect(categorizeAction(0.5, "c")).toBe("review");
    // 0.499 → skip
    expect(categorizeAction(0.499, "c")).toBe("skip");
  });
});

describe("thresholds constants", () => {
  it("has sane values", () => {
    expect(AUTO_APPLY_THRESHOLD).toBeGreaterThan(REVIEW_THRESHOLD);
    expect(AUTO_APPLY_THRESHOLD).toBeLessThanOrEqual(1);
    expect(REVIEW_THRESHOLD).toBeGreaterThanOrEqual(0);
  });
});
