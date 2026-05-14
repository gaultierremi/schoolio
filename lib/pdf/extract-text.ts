// Local PDF text extraction via pdfjs-dist (Mozilla's PDF.js).
//
// Pivot architectural 2026-05-14 : on délaisse Anthropic Vision (re-processe
// le PDF à chaque appel, lent : ~200s sur 176p) au profit d'une extraction
// LOCALE rapide (~1s sur le même PDF). Le texte extrait est ensuite envoyé
// à Sonnet text-only, qui est ~10x plus rapide que Vision sur le même contenu.
//
// Trade-off : on perd les images / diagrammes / structures moléculaires 2D.
// Pour le cours typique de secondaire (chimie, histoire, etc.), ~95% du
// contenu pédagogique reste capturé par le texte.

export type PdfTextExtraction = {
  /** Texte par page, indexé 0-based (pagesText[0] = page 1 du PDF). */
  pagesText: string[];
  /** Nombre total de pages. */
  pageCount: number;
  /** Nombre total de caractères extraits, pour métriques. */
  totalChars: number;
  /** Durée extraction en ms, pour métriques. */
  durationMs: number;
};

/**
 * Extract text content from a PDF buffer using pdfjs-dist (Node-compatible,
 * works without DOM canvas).
 *
 * Warnings TT.undefined* fonts qui s'affichent en stderr sont normaux :
 * certains glyphes décoratifs ne sont pas mappés, sans impact sur le texte
 * extractable. pdfjs-dist 4.x les log mais continue.
 *
 * Notes :
 * - On désactive worker (pas applicable en Node serverless).
 * - On désactive isEvalSupported (sécurité : pas de eval de PDF).
 * - useSystemFonts=true permet une meilleure couverture polices sans bundle.
 */
export async function extractTextFromPdf(
  pdfBuffer: Buffer | Uint8Array,
): Promise<PdfTextExtraction> {
  const t0 = Date.now();
  // Dynamic import : pdfjs-dist est lourd (~3MB), on ne le charge que
  // quand on l'utilise réellement (extraction PDF).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;

  const pagesText: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");
    pagesText.push(text);
  }

  const totalChars = pagesText.reduce((sum, t) => sum + t.length, 0);
  return {
    pagesText,
    pageCount: doc.numPages,
    totalChars,
    durationMs: Date.now() - t0,
  };
}

/**
 * Concatène les pages d'un range avec headers "## Page N" pour préserver
 * la structure spatiale du PDF dans le texte envoyé à l'AI.
 *
 * @param pagesText - Array indexé 0-based des textes par page
 * @param startPage - Première page à inclure (1-indexed, inclusive)
 * @param endPage   - Dernière page à inclure (1-indexed, inclusive)
 */
export function joinPagesAsMarkdown(
  pagesText: string[],
  startPage: number,
  endPage: number,
): string {
  const safeStart = Math.max(1, Math.min(startPage, pagesText.length));
  const safeEnd = Math.max(safeStart, Math.min(endPage, pagesText.length));
  const out: string[] = [];
  for (let p = safeStart; p <= safeEnd; p++) {
    out.push(`## Page ${p}`);
    out.push("");
    out.push(pagesText[p - 1] ?? "");
    out.push("");
  }
  return out.join("\n");
}
