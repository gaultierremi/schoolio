import { describe, it, expect } from "vitest";
import {
  formatSnippetsForPrompt,
  type ContentSnippet,
} from "@/lib/snippets/retrieve";

const baseSnippet = (overrides: Partial<ContentSnippet> = {}): ContentSnippet => ({
  id: "snip-1",
  concept_id: "c-1",
  text: "Un extrait du syllabus.",
  source_kind: "theory_block",
  source_ref: {},
  created_at: "2026-05-14T00:00:00Z",
  created_by: null,
  ...overrides,
});

describe("formatSnippetsForPrompt", () => {
  it("returns empty string for no snippets", () => {
    expect(formatSnippetsForPrompt([])).toBe("");
  });

  it("prefixes syllabus snippets with [Syllabus]", () => {
    const out = formatSnippetsForPrompt([
      baseSnippet({ text: "Définition du concept X.", source_kind: "concept_definition" }),
    ]);
    expect(out).toContain("[Syllabus]");
    expect(out).toContain("Définition du concept X.");
  });

  it("prefixes manual_teacher snippets with [Annotation prof]", () => {
    const out = formatSnippetsForPrompt([
      baseSnippet({ text: "Note du prof.", source_kind: "manual_teacher" }),
    ]);
    expect(out).toContain("[Annotation prof]");
    expect(out).toContain("Note du prof.");
  });

  it("joins multiple snippets with blank lines between blocks", () => {
    const out = formatSnippetsForPrompt([
      baseSnippet({ text: "Premier." }),
      baseSnippet({ id: "snip-2", text: "Deuxième." }),
    ]);
    expect(out).toMatch(/Premier\.\n\n\[Syllabus\]\nDeuxième\./);
  });

  it("caps total output at ~12k chars (drops snippets that would overflow)", () => {
    const big = "x".repeat(4000);
    const snippets: ContentSnippet[] = [
      baseSnippet({ id: "s1", text: big }),
      baseSnippet({ id: "s2", text: big }),
      baseSnippet({ id: "s3", text: big }),
      baseSnippet({ id: "s4", text: big }), // doit être tronqué
    ];
    const out = formatSnippetsForPrompt(snippets);
    expect(out.length).toBeLessThanOrEqual(12000 + 30); // +30 for labels/whitespace
    expect(out).toContain("xxxx"); // first ones kept
  });
});
