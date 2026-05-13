import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractMarkdownFromPdf } from "@/lib/pdf/extract-markdown";
import { detectColumns } from "@/lib/pdf/detect-columns";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

// Fixture: 3 pages extracted from a real FW-B Histoire CESS G syllabus.
// Source: /tmp/jury-histoire.pdf (smoke-test campaign, 2026-05-13).
const FIXTURE_PATH = join(__dirname, "../fixtures/sample-fwb-histoire-3pages.pdf");

describe("extractMarkdownFromPdf", () => {
  it("extracts text from a 3-page FW-B Histoire PDF", async () => {
    const buf = readFileSync(FIXTURE_PATH);
    const result = await extractMarkdownFromPdf(buf.buffer);

    expect(result.pageCount).toBe(3);
    expect(result.totalChars).toBeGreaterThan(100);
    expect(result.markdown).toMatch(/## Page 1/);
    expect(result.markdown).toMatch(/## Page 2/);
    expect(result.markdown).toMatch(/## Page 3/);
  });

  it("returns columnsDetected as 1 or 2", async () => {
    const buf = readFileSync(FIXTURE_PATH);
    const result = await extractMarkdownFromPdf(buf.buffer);

    // We don't require a specific value — depends on the fixture layout.
    // The important invariant is that the value is always valid.
    expect([1, 2]).toContain(result.columnsDetected);
  });

  it("markdown contains non-empty text beyond headings", async () => {
    const buf = readFileSync(FIXTURE_PATH);
    const result = await extractMarkdownFromPdf(buf.buffer);

    // Strip all "## Page N" headings and confirm there is real content left
    const bodyText = result.markdown.replace(/## Page \d+/g, "").trim();
    expect(bodyText.length).toBeGreaterThan(50);
  });
});

describe("detectColumns", () => {
  it("returns columns=1 for fewer than 10 items", () => {
    const items: TextItem[] = [
      { str: "a", dir: "ltr", transform: [1, 0, 0, 1, 50, 700], width: 10, height: 12, fontName: "F1", hasEOL: false },
    ];
    const result = detectColumns(items, 595);
    expect(result.columns).toBe(1);
    expect(result.splitX).toBeUndefined();
  });

  it("detects two columns when bins are far apart", () => {
    // Simulate a 2-column layout: items clustered at x≈50 and x≈320
    const items: TextItem[] = Array.from({ length: 20 }, (_, i) => ({
      str: `word${i}`,
      dir: "ltr" as const,
      // Alternate between left column (x~50) and right column (x~320)
      transform: [1, 0, 0, 1, i % 2 === 0 ? 50 : 320, 700 - i * 20],
      width: 30,
      height: 12,
      fontName: "F1",
      hasEOL: false,
    }));

    const result = detectColumns(items, 595);
    expect(result.columns).toBe(2);
    expect(result.splitX).toBeDefined();
    // splitX should be between the two clusters
    expect(result.splitX).toBeGreaterThan(50);
    expect(result.splitX).toBeLessThan(320);
  });

  it("returns columns=1 when bins are close together", () => {
    // Items all in a single narrow band (single-column page)
    const items: TextItem[] = Array.from({ length: 20 }, (_, i) => ({
      str: `word${i}`,
      dir: "ltr" as const,
      transform: [1, 0, 0, 1, 50 + (i % 3) * 10, 700 - i * 20],
      width: 30,
      height: 12,
      fontName: "F1",
      hasEOL: false,
    }));

    const result = detectColumns(items, 595);
    expect(result.columns).toBe(1);
  });
});
