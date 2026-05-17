import { describe, it, expect } from "vitest";
import {
  SECTION_KINDS,
  isSectionKind,
  isValidUuid,
  validateTheoryPutBody,
  validateMisconceptionPostBody,
  validateMisconceptionPutBody,
  nextOrdinal,
} from "@/lib/curation/validation";

describe("SECTION_KINDS", () => {
  it("exposes exactly 5 canonical section types in the order spec'd", () => {
    expect([...SECTION_KINDS]).toEqual([
      "definition",
      "formules",
      "exemples",
      "prerequis",
      "pieges",
    ]);
  });
});

describe("isSectionKind", () => {
  it("accepts each canonical value", () => {
    for (const k of SECTION_KINDS) {
      expect(isSectionKind(k)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isSectionKind("explication")).toBe(false);
    expect(isSectionKind("DEFINITION")).toBe(false); // case-sensitive
    expect(isSectionKind("")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isSectionKind(undefined)).toBe(false);
    expect(isSectionKind(null)).toBe(false);
    expect(isSectionKind(123)).toBe(false);
    expect(isSectionKind({})).toBe(false);
  });
});

describe("isValidUuid", () => {
  it("accepts canonical v4 UUIDs (lowercase and uppercase)", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("rejects malformed strings", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(isValidUuid("550e8400-e29b-41d4-a716")).toBe(false);
    expect(isValidUuid("")).toBe(false);
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000-extra")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(42)).toBe(false);
  });
});

describe("validateTheoryPutBody", () => {
  it("accepts a well-formed body", () => {
    const result = validateTheoryPutBody({ section_kind: "definition", content: "Hello" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sectionKind).toBe("definition");
      expect(result.content).toBe("Hello");
    }
  });

  it("rejects unknown section_kind", () => {
    const result = validateTheoryPutBody({ section_kind: "foo", content: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/section_kind/);
    }
  });

  it("rejects content that is too short", () => {
    const result = validateTheoryPutBody({ section_kind: "exemples", content: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/1-4000/);
  });

  it("rejects content over 4000 chars", () => {
    const big = "x".repeat(4001);
    const result = validateTheoryPutBody({ section_kind: "pieges", content: big });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/1-4000/);
  });

  it("rejects body that is not an object", () => {
    expect(validateTheoryPutBody(null).ok).toBe(false);
    expect(validateTheoryPutBody("string").ok).toBe(false);
    expect(validateTheoryPutBody(42).ok).toBe(false);
  });
});

describe("validateMisconceptionPostBody", () => {
  it("accepts a valid label and trims whitespace", () => {
    const result = validateMisconceptionPostBody({ label: "  Confusion masse / poids  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.label).toBe("Confusion masse / poids");
  });

  it("rejects empty / whitespace-only label", () => {
    expect(validateMisconceptionPostBody({ label: "" }).ok).toBe(false);
    expect(validateMisconceptionPostBody({ label: "   " }).ok).toBe(false);
  });

  it("rejects label over 300 chars", () => {
    const big = "x".repeat(301);
    expect(validateMisconceptionPostBody({ label: big }).ok).toBe(false);
  });

  it("rejects missing label", () => {
    expect(validateMisconceptionPostBody({}).ok).toBe(false);
  });
});

describe("validateMisconceptionPutBody", () => {
  it("accepts label only", () => {
    const result = validateMisconceptionPutBody({ label: "Nouveau libellé" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.update).toEqual({ label: "Nouveau libellé" });
    }
  });

  it("accepts ordinal only", () => {
    const result = validateMisconceptionPutBody({ ordinal: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.update).toEqual({ ordinal: 3 });
  });

  it("accepts both label and ordinal", () => {
    const result = validateMisconceptionPutBody({ label: "X", ordinal: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.update).toEqual({ label: "X", ordinal: 5 });
  });

  it("rejects empty body", () => {
    const result = validateMisconceptionPutBody({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Au moins un/);
  });

  it("rejects non-integer ordinal", () => {
    expect(validateMisconceptionPutBody({ ordinal: 1.5 }).ok).toBe(false);
    expect(validateMisconceptionPutBody({ ordinal: "3" }).ok).toBe(false);
  });

  it("rejects ordinal out of range", () => {
    expect(validateMisconceptionPutBody({ ordinal: 0 }).ok).toBe(false);
    expect(validateMisconceptionPutBody({ ordinal: 11 }).ok).toBe(false);
    expect(validateMisconceptionPutBody({ ordinal: -1 }).ok).toBe(false);
  });
});

describe("nextOrdinal", () => {
  it("returns 1 when no current rows", () => {
    expect(nextOrdinal(null)).toBe(1);
    expect(nextOrdinal(undefined)).toBe(1);
  });

  it("increments the current max", () => {
    expect(nextOrdinal(3)).toBe(4);
    expect(nextOrdinal(9)).toBe(10);
  });

  it("returns null when next would exceed the limit", () => {
    expect(nextOrdinal(10)).toBeNull();
    expect(nextOrdinal(15)).toBeNull();
  });

  it("respects a custom max", () => {
    expect(nextOrdinal(4, 5)).toBe(5);
    expect(nextOrdinal(5, 5)).toBeNull();
  });
});
