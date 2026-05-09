import { PDFDocument } from "pdf-lib";

/**
 * Returns the page count of a PDF buffer.
 * Returns 0 on any error (encrypted, malformed, etc.) — callers should
 * treat 0 as "unknown" and store NULL rather than 0 in the DB.
 */
export async function getPdfPagesCount(
  pdfBuffer: Buffer | Uint8Array
): Promise<number> {
  try {
    const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return 0;
  }
}

/**
 * Extracts a contiguous page range from a PDF and returns the resulting PDF
 * as a Uint8Array.
 *
 * @param pdfBuffer - Full PDF bytes (Buffer or Uint8Array)
 * @param startPage - First page to include, 1-indexed (inclusive)
 * @param endPage   - Last page to include, 1-indexed (inclusive)
 *
 * Throws if the range is invalid or the PDF cannot be loaded.
 * Callers should catch and fall back to the full PDF if needed.
 */
export async function extractPagesFromPdf({
  pdfBuffer,
  startPage,
  endPage,
}: {
  pdfBuffer: Buffer | Uint8Array;
  startPage: number;
  endPage: number;
}): Promise<Uint8Array> {
  const src = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const total = src.getPageCount();

  const clampedEnd = Math.min(endPage, total);
  const clampedStart = Math.max(1, startPage);

  if (clampedStart > clampedEnd) {
    throw new Error(
      `Plage invalide : pages ${startPage}–${endPage} hors du PDF (${total} pages)`
    );
  }

  const indices = Array.from(
    { length: clampedEnd - clampedStart + 1 },
    (_, i) => clampedStart - 1 + i
  );

  const dst = await PDFDocument.create();
  const copied = await dst.copyPages(src, indices);
  for (const page of copied) dst.addPage(page);

  return dst.save();
}
