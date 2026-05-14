import { describe, it, expect } from "vitest";
import { currentAcademicYear, ACADEMIC_YEAR_RE } from "@/lib/dates";

describe("currentAcademicYear", () => {
  it("returns YYYY/YYYY+1 for dates from August onwards", () => {
    expect(currentAcademicYear(new Date(2026, 7, 1))).toBe("2026/2027");   // Aug 1
    expect(currentAcademicYear(new Date(2026, 11, 31))).toBe("2026/2027"); // Dec 31
  });

  it("returns YYYY-1/YYYY for dates before August (Jan-July)", () => {
    expect(currentAcademicYear(new Date(2026, 0, 15))).toBe("2025/2026"); // Jan
    expect(currentAcademicYear(new Date(2026, 4, 14))).toBe("2025/2026"); // May
    expect(currentAcademicYear(new Date(2026, 6, 31))).toBe("2025/2026"); // Jul 31
  });

  it("flips on Aug 1st", () => {
    expect(currentAcademicYear(new Date(2026, 6, 31))).toBe("2025/2026");
    expect(currentAcademicYear(new Date(2026, 7, 1))).toBe("2026/2027");
  });

  it("works across year boundaries", () => {
    expect(currentAcademicYear(new Date(2026, 8, 30))).toBe("2026/2027");
    expect(currentAcademicYear(new Date(2027, 0, 15))).toBe("2026/2027"); // Jan still in 2026/2027
    expect(currentAcademicYear(new Date(2027, 7, 1))).toBe("2027/2028");
  });
});

describe("ACADEMIC_YEAR_RE", () => {
  it("matches valid YYYY/YYYY", () => {
    expect(ACADEMIC_YEAR_RE.test("2025/2026")).toBe(true);
    expect(ACADEMIC_YEAR_RE.test("2099/2100")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(ACADEMIC_YEAR_RE.test("2025-2026")).toBe(false);
    expect(ACADEMIC_YEAR_RE.test("25/26")).toBe(false);
    expect(ACADEMIC_YEAR_RE.test("2025")).toBe(false);
    expect(ACADEMIC_YEAR_RE.test("")).toBe(false);
  });
});
