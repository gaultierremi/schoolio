import { detectColumns } from "./detect-columns";
import type { TextItem, TextMarkedContent } from "pdfjs-dist/types/src/display/api";

export type ExtractedMarkdown = {
  /** Full extracted text as markdown, with "## Page N" headings. */
  markdown: string;
  /** Number of pages in the PDF. */
  pageCount: number;
  /** Total extracted character count (excluding headings). */
  totalChars: number;
  /**
   * Whether any page was detected as 2-column.
   * 2 means at least one page triggered the column-detection heuristic.
   */
  columnsDetected: 1 | 2;
};

/**
 * Extract text from a PDF buffer as markdown.
 *
 * Uses pdfjs-dist via dynamic import so the Next.js server bundle alias
 * (which stubs pdfjs-dist out entirely) is bypassed at runtime. Vitest
 * in Node mode resolves pdfjs-dist normally — no alias applies.
 *
 * For 2-column pages (detected by detectColumns), items are sorted
 * left-column-top-to-bottom first, then right-column-top-to-bottom,
 * producing correct reading order instead of the garbled interleave
 * a naïve sort would produce.
 *
 * Throws if pdfjs-dist cannot parse the buffer — callers should catch
 * and update the ingestion_jobs status to "failed".
 */
export async function extractMarkdownFromPdf(
  pdfBuffer: ArrayBuffer
): Promise<ExtractedMarkdown> {
  // Dynamic import bypasses the `pdfjs-dist → false` server webpack alias.
  // In Node/Vitest, this resolves to the legacy build which ships a
  // self-contained Node-compatible version without browser Worker overhead.
  // The legacy build is explicitly recommended by pdfjs-dist for Node environments.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // The legacy build still needs a workerSrc. In Node, we point it at the
  // bundled legacy worker — pdfjs uses a fake worker shim in this mode.
  const workerPath = new URL(
    "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url
  );
  (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
    workerPath.toString();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const parts: string[] = [];
  let totalChars = 0;
  let columnsDetected: 1 | 2 = 1;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    // Filter to TextItem only (ignore TextMarkedContent which has no str/transform)
    const textItems = content.items.filter(
      (item): item is TextItem =>
        "str" in item && "transform" in item && typeof item.str === "string"
    );

    const colInfo = detectColumns(textItems, viewport.width);
    if (colInfo.columns === 2) columnsDetected = 2;

    let sorted: TextItem[];

    if (colInfo.columns === 2 && colInfo.splitX !== undefined) {
      const splitX = colInfo.splitX;
      // Read left column top-to-bottom (Y descends in PDF coordinates)
      const leftCol = textItems
        .filter((item) => (item.transform[4] as number) < splitX)
        .sort((a, b) => (b.transform[5] as number) - (a.transform[5] as number));
      // Read right column top-to-bottom
      const rightCol = textItems
        .filter((item) => (item.transform[4] as number) >= splitX)
        .sort((a, b) => (b.transform[5] as number) - (a.transform[5] as number));
      sorted = [...leftCol, ...rightCol];
    } else {
      sorted = [...textItems].sort(
        (a, b) => (b.transform[5] as number) - (a.transform[5] as number)
      );
    }

    const pageText = sorted.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
    parts.push(`## Page ${pageNum}\n\n${pageText}`);
    totalChars += pageText.length;
  }

  return {
    markdown: parts.join("\n\n"),
    pageCount: pdf.numPages,
    totalChars,
    columnsDetected,
  };
}
