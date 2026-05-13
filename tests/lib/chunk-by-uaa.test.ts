import { describe, it, expect } from "vitest";
import { chunkByUaa } from "@/lib/ingestion/chunk-by-uaa";

describe("chunkByUaa", () => {
  it("splits on UAA headers with colon separator", () => {
    const md = "Preamble text\n\nUAA5 : Réactions chimiques\nSome content\n\nUAA6 : Stœchiométrie\nMore content";
    const chunks = chunkByUaa(md);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].code).toBe("UAA5");
    expect(chunks[0].label).toBe("Réactions chimiques");
    expect(chunks[0].ordinal).toBe(1);
    expect(chunks[0].content).toContain("Some content");
    expect(chunks[1].code).toBe("UAA6");
    expect(chunks[1].label).toBe("Stœchiométrie");
    expect(chunks[1].ordinal).toBe(2);
  });

  it("returns empty when no UAA headers found", () => {
    expect(chunkByUaa("just regular text without any headers")).toEqual([]);
  });

  it("accepts UAA with dash separator (UAA 5 — title)", () => {
    const chunks = chunkByUaa("UAA 5 — Title\nbody");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].code).toBe("UAA5");
    expect(chunks[0].label).toBe("Title");
  });

  it("accepts UAA with hyphen separator (UAA5 - title)", () => {
    const chunks = chunkByUaa("UAA5 - Réactions");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].label).toBe("Réactions");
  });

  it("captures multi-line content under each UAA", () => {
    const md = "UAA1 : Premier\nLine 1\nLine 2\nLine 3\n\nUAA2 : Deuxième\nLine A";
    const chunks = chunkByUaa(md);
    expect(chunks[0].content.split("\n")).toHaveLength(5);  // header + 3 lines + empty
    expect(chunks[1].content).toContain("Line A");
  });

  it("preserves the header line in each chunk content", () => {
    const md = "UAA1 : Test\nbody";
    const chunks = chunkByUaa(md);
    expect(chunks[0].content).toMatch(/^UAA1 : Test/);
  });
});
