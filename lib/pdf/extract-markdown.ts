import Anthropic from "@anthropic-ai/sdk";

export type ExtractedMarkdown = {
  /** Full extracted text as markdown, with "## Page N" headings. */
  markdown: string;
  /** Number of pages in the PDF (inferred from markdown). */
  pageCount: number;
  /** Total extracted character count. */
  totalChars: number;
  /**
   * Always 1 — Claude handles multi-column layouts transparently
   * in its native PDF reader. Kept for orchestrator metadata compatibility.
   */
  columnsDetected: 1;
};

/**
 * Extract text from a PDF buffer as markdown via Anthropic's PDF Files API.
 *
 * We pivoted from local pdfjs-dist (Sprint 1 T3 → T11 attempts) because pdfjs
 * proved too brittle in Vercel serverless : multiple opaque worker resolution
 * errors ("e.replace is not a function", "o is not a function") that we
 * couldn't reliably fix without either (a) shipping the worker file as a
 * static asset and patching the path at runtime, or (b) maintaining a separate
 * `nodejs` runtime config — both deferred to future cleanups when we hit
 * actual cost issues with Claude PDF extraction.
 *
 * Cost : a 27-page Histoire syllabus consumes ~50K input + ~30K output tokens
 * via Claude Sonnet 4.6 — roughly $0.30-0.40 per extraction. Well within the
 * dogfood budget. Sprint 7 can revisit if we end up extracting hundreds per day.
 *
 * Latency : 20-60s for a full syllabus, depending on size. The orchestrator's
 * waitUntil-driven background execution absorbs this without blocking the UI.
 */
export async function extractMarkdownFromPdf(
  pdfBuffer: ArrayBuffer
): Promise<ExtractedMarkdown> {
  const client = new Anthropic();

  // Convert ArrayBuffer → base64 (Node Buffer for size efficiency)
  const base64 = Buffer.from(pdfBuffer).toString("base64");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 64000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          {
            type: "text",
            text: [
              "Extrais TOUT le texte de ce PDF en markdown.",
              "",
              "Règles strictes :",
              "1. Préfixe chaque page par un heading markdown `## Page N` (N = numéro de page, commençant à 1)",
              "2. Préserve la structure : si le PDF a des sous-sections, garde-les sous forme de paragraphes",
              "3. Si tu vois des en-têtes de type 'UAA1', 'UAA2', etc., garde-les EXACTEMENT comme dans le source — ces marqueurs sont critiques pour le chunking en aval",
              "4. Ignore les numéros de page en bas/haut des pages, les en-têtes de page répétés, les filigranes",
              "5. Pour les tableaux : convertis en markdown tables si simple, sinon en liste à puces",
              "6. Pour les colonnes : lis la colonne de gauche entièrement avant la colonne de droite",
              "",
              "Retourne UNIQUEMENT le markdown extrait, sans préambule, sans commentaire, sans markdown fences.",
            ].join("\n"),
          },
        ],
      },
    ],
  });

  const firstBlock = response.content[0];
  if (!firstBlock || firstBlock.type !== "text") {
    throw new Error("Anthropic PDF extraction returned no text block");
  }

  const markdown = firstBlock.text.trim();

  // Count pages via "## Page N" headings (Claude follows the instruction reliably)
  const pageMatches = markdown.match(/^## Page \d+/gm) ?? [];
  const pageCount = pageMatches.length;

  return {
    markdown,
    pageCount,
    totalChars: markdown.length,
    columnsDetected: 1,
  };
}
