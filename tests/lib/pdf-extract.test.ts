import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn(async () => ({
    content: [
      {
        type: "text",
        text: "## Page 1\n\nUAA1 : Réactions chimiques\nLorem ipsum.\n\n## Page 2\n\nUAA2 : Stœchiométrie\nDolor sit amet.",
      },
    ],
  }));
  const Anthropic = vi.fn(() => ({ messages: { create } }));
  return { default: Anthropic };
});

import { extractMarkdownFromPdf } from "@/lib/pdf/extract-markdown";

describe("extractMarkdownFromPdf (Anthropic PDF Files API)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns markdown + page count + totalChars from Claude response", async () => {
    const buf = new ArrayBuffer(100);
    const result = await extractMarkdownFromPdf(buf);

    expect(result.markdown).toMatch(/## Page 1/);
    expect(result.markdown).toMatch(/## Page 2/);
    expect(result.markdown).toMatch(/UAA1/);
    expect(result.markdown).toMatch(/UAA2/);
    expect(result.pageCount).toBe(2);
    expect(result.totalChars).toBeGreaterThan(50);
    expect(result.columnsDetected).toBe(1);
  });

  it("infers page count from '## Page N' headings", async () => {
    const buf = new ArrayBuffer(100);
    const result = await extractMarkdownFromPdf(buf);
    const matches = result.markdown.match(/^## Page \d+/gm) ?? [];
    expect(result.pageCount).toBe(matches.length);
  });

  it("columnsDetected is always 1 (Claude handles columns natively)", async () => {
    const buf = new ArrayBuffer(100);
    const result = await extractMarkdownFromPdf(buf);
    expect(result.columnsDetected).toBe(1);
  });
});
