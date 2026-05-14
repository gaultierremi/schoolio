// Local PDF text extraction.
//
// Pivot architectural 2026-05-14 : on délaisse Anthropic Vision (re-processe
// le PDF à chaque appel, lent : ~200s sur 176p) au profit d'une extraction
// LOCALE rapide (~1s sur le même PDF). Le texte extrait est ensuite envoyé
// à Sonnet text-only, qui est ~10x plus rapide que Vision sur le même contenu.
//
// Implémentation v2 : on utilise `pdf-parse` plutôt que pdfjs-dist direct.
// Raison : pdfjs-dist 4.x essaie de charger un worker file (pdf.worker.mjs)
// même en mode disableWorker, ce qui plante sur Trigger.dev cloud
// ("Cannot find module '/app/pdf.worker.mjs'"). pdf-parse encapsule pdfjs
// proprement pour Node serverless sans cette dépendance.
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
 * Extract text content from a PDF buffer using `pdf-parse`.
 *
 * pdf-parse retourne le texte intégral du PDF avec des `\n` entre les pages
 * et un `\f` (form feed) en délimiteur de page. On split sur `\f` pour
 * récupérer le texte par page.
 *
 * Returns pages 1-indexed dans pagesText (page N = pagesText[N-1]).
 */
export async function extractTextFromPdf(
  pdfBuffer: Buffer | Uint8Array,
): Promise<PdfTextExtraction> {
  const t0 = Date.now();

  // Dynamic import : pdf-parse charge pdfjs-dist en interne mais sans dépendance
  // au worker file en runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParseMod: any = await import("pdf-parse");
  const pdfParse = pdfParseMod.default ?? pdfParseMod;

  const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  const result = await pdfParse(buf);

  // pdf-parse insère un form-feed (\f, U+000C) entre les pages dans `.text`.
  // On split là-dessus pour reconstituer les pages individuellement.
  const rawText: string = result.text ?? "";
  const parts = rawText.split("\f");

  // Filtrer les pages vides en queue (parfois pdf-parse ajoute un \f final).
  while (parts.length > 0 && parts[parts.length - 1].trim() === "") {
    parts.pop();
  }

  // Si on a moins de pages que result.numpages (peut arriver si certaines
  // pages ont 0 contenu textuel), on pad avec strings vides pour préserver
  // l'index par page.
  const numPages = result.numpages ?? parts.length;
  const pagesText: string[] = [];
  for (let i = 0; i < numPages; i++) {
    pagesText.push((parts[i] ?? "").trim());
  }

  const totalChars = pagesText.reduce((sum, t) => sum + t.length, 0);
  return {
    pagesText,
    pageCount: numPages,
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
