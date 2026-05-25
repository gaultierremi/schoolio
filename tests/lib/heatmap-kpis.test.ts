import { describe, it, expect } from "vitest";
import { computeParticipation, computeClassAverage } from "@/lib/heatmap-kpis";

describe("computeParticipation", () => {
  it("counts completed students", () => {
    const result = computeParticipation([
      { status: "completed" },
      { status: "completed" },
      { status: "in_progress" },
      { status: "not_started" },
    ]);
    expect(result.completed).toBe(2);
    expect(result.total).toBe(4);
    expect(result.pct).toBe(50);
  });

  it("returns 0% for empty class", () => {
    const result = computeParticipation([]);
    expect(result.completed).toBe(0);
    expect(result.total).toBe(0);
    expect(result.pct).toBe(0);
  });

  it("returns 100% when all done", () => {
    const result = computeParticipation([
      { status: "completed" },
      { status: "completed" },
    ]);
    expect(result.pct).toBe(100);
  });

  it("returns 0% when none done", () => {
    const result = computeParticipation([
      { status: "in_progress" },
      { status: "not_started" },
    ]);
    expect(result.pct).toBe(0);
  });
});

describe("computeClassAverage", () => {
  it("averages non-zero values", () => {
    expect(computeClassAverage([60, 80, 40])).toBe(60);
  });

  it("ignores zero values (concepts non évalués)", () => {
    // (60+80) / 2 = 70
    expect(computeClassAverage([60, 0, 80])).toBe(70);
  });

  it("returns 0 for empty array", () => {
    expect(computeClassAverage([])).toBe(0);
  });

  it("returns 0 when all zeros", () => {
    expect(computeClassAverage([0, 0, 0])).toBe(0);
  });

  it("rounds to nearest integer", () => {
    // (60 + 65 + 70) / 3 = 65
    expect(computeClassAverage([60, 65, 70])).toBe(65);
    // (33 + 33 + 34) / 3 = 33.33...
    expect(computeClassAverage([33, 33, 34])).toBe(33);
  });
});
