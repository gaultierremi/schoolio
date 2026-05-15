import { describe, it, expect } from "vitest";
import { IMAGE_TYPES, SKIP_TYPES, isSkipType, isValidImageType } from "@/lib/pdf/image-types";

describe("IMAGE_TYPES taxonomy", () => {
  it("has exactly 71 entries (64 pedagogical + 7 skip)", () => {
    expect(IMAGE_TYPES.length).toBe(71);
  });

  it("SKIP_TYPES is exactly 7 entries", () => {
    expect(SKIP_TYPES.length).toBe(7);
  });

  it("every SKIP_TYPE is in IMAGE_TYPES", () => {
    for (const t of SKIP_TYPES) {
      expect(IMAGE_TYPES).toContain(t);
    }
  });

  it("isSkipType detects skip types", () => {
    expect(isSkipType("logo")).toBe(true);
    expect(isSkipType("cell_diagram")).toBe(false);
  });

  it("isValidImageType validates strings", () => {
    expect(isValidImageType("cell_diagram")).toBe(true);
    expect(isValidImageType("nonexistent")).toBe(false);
    expect(isValidImageType("")).toBe(false);
    expect(isValidImageType(null)).toBe(false);
  });
});
