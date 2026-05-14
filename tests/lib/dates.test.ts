import { describe, it, expect } from "vitest";
import {
  currentAcademicYear,
  ACADEMIC_YEAR_RE,
  classAccessCutoff,
  isClassAccessible,
  accessibleAcademicYears,
} from "@/lib/dates";

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

describe("classAccessCutoff", () => {
  it("returns Dec 31 23:59:59 of the end year", () => {

    // classAccessCutoff imported at top
    const c = classAccessCutoff("2025/2026");
    expect(c).not.toBeNull();
    expect(c!.getFullYear()).toBe(2026);
    expect(c!.getMonth()).toBe(11); // December
    expect(c!.getDate()).toBe(31);
  });

  it("returns null for malformed input", () => {
    // classAccessCutoff imported at top
    expect(classAccessCutoff("2025-2026")).toBeNull();
    expect(classAccessCutoff("")).toBeNull();
  });
});

describe("isClassAccessible", () => {
  it("true during the academic year + extended window (until Dec 31 end year)", () => {
    // isClassAccessible imported at top
    // 2025/2026 should be accessible from Aug 2025 to Dec 31 2026 23:59:59
    expect(isClassAccessible("2025/2026", new Date(2025, 8, 15))).toBe(true); // Sept 2025
    expect(isClassAccessible("2025/2026", new Date(2026, 5, 15))).toBe(true); // Jun 2026
    expect(isClassAccessible("2025/2026", new Date(2026, 7, 25))).toBe(true); // Aug 25 2026 (retake)
    expect(isClassAccessible("2025/2026", new Date(2026, 11, 31, 22, 0))).toBe(true); // Dec 31 evening
  });

  it("false after Dec 31 of end year", () => {
    // isClassAccessible imported at top
    expect(isClassAccessible("2025/2026", new Date(2027, 0, 1))).toBe(false); // Jan 1 2027
    expect(isClassAccessible("2025/2026", new Date(2027, 5, 1))).toBe(false); // 6 months later
  });
});

describe("accessibleAcademicYears", () => {
  it("includes only current year in early August (before retake window of previous matters)", () => {
    // accessibleAcademicYears imported at top
    // Aug 1 2026 → current = 2026/2027, previous = 2025/2026 still accessible (Dec 31 2026 cutoff)
    const result = accessibleAcademicYears(new Date(2026, 7, 1));
    expect(result).toContain("2026/2027");
    expect(result).toContain("2025/2026");
  });

  it("drops previous year after Jan 1 of year after end year", () => {
    // accessibleAcademicYears imported at top
    // Jan 1 2027 → current = 2026/2027, previous = 2025/2026 cutoff was Dec 31 2026 → dropped
    const result = accessibleAcademicYears(new Date(2027, 0, 15));
    expect(result).toContain("2026/2027");
    expect(result).not.toContain("2025/2026");
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
