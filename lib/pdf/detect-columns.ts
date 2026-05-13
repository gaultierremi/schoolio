import type { TextItem } from "pdfjs-dist/types/src/display/api";

/**
 * Detect whether a page is laid out in two columns.
 *
 * Heuristic: x-coordinates of text items are binned in 20-unit windows.
 * If the two most-populated bins are > 200 units apart AND the right bin
 * starts before 90% of the page width, we classify the page as 2-column.
 *
 * This covers the FW-B Histoire / Chimie syllabi that have a left column
 * starting around x=50 and a right column starting around x=310+.
 *
 * Returns { columns: 2, splitX } where splitX is the midpoint between
 * the two dominant bins — use it to partition items for correct reflow.
 */
export function detectColumns(
  items: TextItem[],
  pageWidth: number
): { columns: 1 | 2; splitX?: number } {
  if (items.length < 10) return { columns: 1 };

  // Bin x-coordinates into 20-unit windows, count items per bin
  const bins = new Map<number, number>();
  for (const item of items) {
    const x = item.transform[4] as number;
    const bin = Math.floor(x / 20) * 20;
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }

  // Take the two most-populated bins, sorted by x position (left → right)
  const sorted = [...bins.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length < 2) return { columns: 1 };

  const [leftBin, rightBin] = sorted
    .slice(0, 2)
    .map(([bin]) => bin)
    .sort((a, b) => a - b);

  const gap = rightBin - leftBin;

  // Two-column FW-B PDFs: leftBin ≈ 50, rightBin ≈ 310–330, gap > 200.
  // The right column must not start near the page edge (< 90% of width)
  // to exclude right-margin artefacts.
  if (gap > 200 && rightBin < pageWidth * 0.9) {
    const splitX = (leftBin + rightBin) / 2;
    return { columns: 2, splitX };
  }

  return { columns: 1 };
}
