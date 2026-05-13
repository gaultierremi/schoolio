import { describe, it, expect } from "vitest";
import { buildTheoryPrompt } from "@/lib/ingestion/prompts/theory";

describe("buildTheoryPrompt", () => {
  const baseInput = {
    schoolId: "00000000-0000-0000-0000-000000000001",
    programId: "p-abc",
    conceptName: "Stœchiométrie",
    conceptSlug: "stoechiometrie",
    uaaCode: "UAA5",
    uaaLabel: "Réactions chimiques",
    syllabusContent: "Lorem ipsum syllabus chunk content here.",
  };

  it("pins model to claude-sonnet-4-6", () => {
    const params = buildTheoryPrompt(baseInput);
    expect(params.model).toBe("claude-sonnet-4-6");
    expect(params.max_tokens).toBe(4000);
  });

  it("includes the concept name in the user message", () => {
    const params = buildTheoryPrompt(baseInput);
    const userText = JSON.stringify(params.messages[0].content);
    expect(userText).toContain("Stœchiométrie");
    expect(userText).toContain("UAA5");
    expect(userText).toContain("Réactions chimiques");
  });

  it("includes the syllabus content verbatim", () => {
    const params = buildTheoryPrompt(baseInput);
    const userText = JSON.stringify(params.messages[0].content);
    expect(userText).toContain("Lorem ipsum syllabus chunk content here");
  });

  it("pre-fills assistant message with { to force JSON-only output", () => {
    const params = buildTheoryPrompt(baseInput);
    expect(params.messages).toHaveLength(2);
    expect(params.messages[1].role).toBe("assistant");
    const assistantContent = params.messages[1]
      .content as { type: string; text: string }[];
    expect(assistantContent[0].text).toBe("{");
  });

  it("includes provenance constraint instruction", () => {
    const params = buildTheoryPrompt(baseInput);
    const userText = JSON.stringify(params.messages[0].content);
    expect(userText).toMatch(/source_quote/);
    expect(userText).toMatch(/source_concept_path/);
    expect(userText).toMatch(/provenance/i);
  });
});
