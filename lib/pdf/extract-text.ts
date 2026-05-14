// Local PDF text extraction.
//
// Pivot architectural 2026-05-14 : on délaisse Anthropic Vision (re-processe
// le PDF à chaque appel, lent : ~200s sur 176p) au profit d'une extraction
// LOCALE rapide (~1s sur le même PDF). Le texte extrait est ensuite envoyé
// à Sonnet text-only, qui est ~10x plus rapide que Vision sur le même contenu.
//
// Implémentation v3 (serverless-safe) : on utilise `unpdf` (fork serverless
// de pdfjs-dist maintenu par l'équipe Nuxt). unpdf embarque un build pdfjs
// pré-configuré pour Node serverless — pas de worker file à charger, pas
// de test fixture à embarquer, single import.
//
// Historique des tentatives ratées (à ne pas refaire) :
//   1) pdfjs-dist 4.10.38 direct → "Cannot find module '/app/pdf.worker.mjs'"
//      en cloud Trigger.dev (le worker file n'est pas bundlé).
//   2) pdfjs-dist + disableWorker:true → MÊME erreur (option ignorée en v4).
//   3) pdf-parse 1.1.1 → "ENOENT: ./test/data/05-versions-space.pdf"
//      (bug connu : son index.js charge un fixture de test au startup).
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
 * Extract text content from a PDF buffer using `unpdf`.
 *
 * unpdf retourne `{ totalPages, text }` où `text` est un `string[]` (une
 * entrée par page) quand `mergePages: false`. On l'utilise tel quel.
 *
 * Returns pages 1-indexed dans pagesText (page N = pagesText[N-1]).
 */
export async function extractTextFromPdf(
  pdfBuffer: Buffer | Uint8Array,
): Promise<PdfTextExtraction> {
  const t0 = Date.now();

  // Dynamic import : évite de charger unpdf au cold-start si l'extraction
  // n'est pas appelée (la lib pèse plusieurs MB une fois bundlée).
  const { extractText, getDocumentProxy } = await import("unpdf");

  // unpdf veut un Uint8Array (pas un Buffer Node). Buffer extends Uint8Array
  // mais on normalise pour être safe sur tous les runtimes.
  const data =
    pdfBuffer instanceof Uint8Array && !Buffer.isBuffer(pdfBuffer)
      ? pdfBuffer
      : new Uint8Array(
          pdfBuffer.buffer,
          pdfBuffer.byteOffset,
          pdfBuffer.byteLength,
        );

  // On passe par getDocumentProxy d'abord pour avoir un PDFDocumentProxy
  // réutilisable si on veut ajouter de l'extraction d'images plus tard.
  const pdf = await getDocumentProxy(data);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  // Defensive : trim et garantit qu'on a exactement totalPages entrées
  // (au cas où unpdf retournerait une longueur différente).
  const pagesText: string[] = [];
  for (let i = 0; i < totalPages; i++) {
    pagesText.push((text[i] ?? "").trim());
  }

  const totalChars = pagesText.reduce((sum, t) => sum + t.length, 0);
  return {
    pagesText,
    pageCount: totalPages,
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
