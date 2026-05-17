// Dispatcher d'extraction documents : PDF / DOCX / PPTX.
//
// Sprint M.0 (2026-05-16) : ne supporte QUE PDF — meme signature de retour
// que extract-text.ts existant. Zero changement de comportement pour le
// funnel PDF qui marche en prod.
//
// Sprint M.1 (DOCX) et M.2 (PPTX) ajouteront des branches conditionnees par
// feature flags DOCX_UPLOAD_ENABLED / PPTX_UPLOAD_ENABLED.
//
// Hard rule : si mimeType inconnu ou manquant, on default sur PDF (path le
// plus eprouve). Jamais throw si le buffer est un PDF valide.

import { extractTextFromPdf, type PdfTextExtraction } from "@/lib/pdf/extract-text";
import { extractImagesFromPdf, type ExtractedImage } from "@/lib/pdf/extract-images";

// Types MIME normalises supportes (etendu en M.1/M.2).
export type DocumentMimeType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" // .docx
  | "application/vnd.openxmlformats-officedocument.presentationml.presentation" // .pptx
  | "unknown";

// Retour unifie : meme shape que PdfTextExtraction pour compat existante.
// Sprint M.1/M.2 ajouteront pageBoundaries pour mapping images→page.
export type DocumentTextExtraction = PdfTextExtraction;

/**
 * Normalize une chaine MIME ou extension en DocumentMimeType.
 * Tolerant : si le mime est vide/garbage et l'extension est .pdf, retourne pdf.
 */
export function detectMimeType(filename: string | null, mimeHint?: string | null): DocumentMimeType {
  const m = (mimeHint ?? "").toLowerCase().trim();
  if (m === "application/pdf") return "application/pdf";
  if (m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (m === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  const ext = (filename ?? "").toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "unknown";
}

/**
 * Extract texte depuis un document. Dispatcher par mimeType.
 * Sprint M.0 : seulement PDF (les autres routes lancent error).
 *
 * @param buffer  contenu binaire du fichier
 * @param mime    type MIME normalise. Si "unknown" -> default sur PDF (defensive).
 */
export async function extractTextFromDocument(
  buffer: Buffer,
  mime: DocumentMimeType,
): Promise<DocumentTextExtraction> {
  // Default sur PDF pour "unknown" — c'est le path le plus eprouve.
  // Hard rule M.0 : ne JAMAIS casser le flow PDF a cause d'une detection
  // MIME ratee. Si le buffer n'est pas un PDF valide, unpdf throw avec un
  // message clair — meilleur que crasher avec "format inconnu".
  if (mime === "application/pdf" || mime === "unknown") {
    return extractTextFromPdf(buffer);
  }

  // Sprint M.1 :
  // if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
  //   const { extractTextFromDocx } = await import("@/lib/docx/extract-text");
  //   return extractTextFromDocx(buffer);
  // }

  // Sprint M.2 :
  // if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
  //   const { extractTextFromPptx } = await import("@/lib/pptx/extract-text");
  //   return extractTextFromPptx(buffer);
  // }

  // Should be unreachable while only PDF is implemented.
  throw new Error(`Document mime type not yet supported by dispatcher: ${mime}`);
}

/**
 * Extract images depuis un document. Dispatcher par mimeType.
 * Sprint M.0 : seulement PDF.
 *
 * @param buffer  contenu binaire (CLONE — peut etre detache par le caller texte)
 * @param mime    type MIME normalise. Default sur PDF si "unknown".
 */
export async function extractImagesFromDocument(
  buffer: Buffer,
  mime: DocumentMimeType,
): Promise<ExtractedImage[]> {
  if (mime === "application/pdf" || mime === "unknown") {
    return extractImagesFromPdf(buffer);
  }

  // Sprint M.1 :
  // if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
  //   const { extractImagesFromDocx } = await import("@/lib/docx/extract-images");
  //   return extractImagesFromDocx(buffer);
  // }

  // Sprint M.2 :
  // if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
  //   const { extractImagesFromPptx } = await import("@/lib/pptx/extract-images");
  //   return extractImagesFromPptx(buffer);
  // }

  throw new Error(`Document mime type not yet supported by dispatcher: ${mime}`);
}

// Re-export utiles pour les callers
export type { ExtractedImage };
