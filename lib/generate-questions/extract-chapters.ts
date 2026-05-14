// Pre-pass Anthropic : on demande à Claude d'identifier la table des matières
// du PDF (chapitres, UAA, sections principales) AVANT de générer les questions.
// Réponse petite (~500-2000 chars) → 0 risque de tronquature.
//
// Pourquoi : avant on découpait le PDF en tranches AVEUGLES (pages 1-44, 45-88…)
// sans connaître la structure pédagogique. Résultat : questions overlap entre
// workers, period bricolé, output JSON parfois tronqué. Avec extract-chapters
// on a une carte du PDF avant de générer → 1 appel ciblé par chapitre.

import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { routeAIRequest } from "@/lib/ai-router";

export type Chapter = {
  title: string;
  pageStart: number;
  pageEnd: number;
};

/**
 * Parse résilient de la réponse Anthropic/Gemini :
 *   1) JSON.parse direct si la réponse est pure
 *   2) Strip des fences markdown (```json ... ```)
 *   3) Match greedy { ... } pour ignorer le prose avant/après
 *   4) Fallback: empty chapters → le caller utilisera "Document complet"
 */
function parseChaptersResponse(raw: string): { chapters?: Chapter[] } {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch { /* try fence */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* try greedy */ }
  }
  const greedy = trimmed.match(/\{[\s\S]*\}/);
  if (greedy?.[0]) {
    try { return JSON.parse(greedy[0]); } catch { /* give up */ }
  }
  return { chapters: [] };
}

const CHAPTERS_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    chapters: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          pageStart: { type: SchemaType.INTEGER },
          pageEnd: { type: SchemaType.INTEGER },
        },
        required: ["title", "pageStart", "pageEnd"],
      },
    },
  },
  required: ["chapters"],
};

/**
 * Extrait la liste des chapitres pédagogiques du PDF.
 * Filtre les pages non-pédagogiques (TOC, index, annexes, page de garde).
 * Si Claude ne trouve aucune structure (PDF flat, pas de chapitres), retourne
 * un seul "Document complet" sur toutes les pages — le caller pourra fallback
 * sur le découpage aveugle si besoin.
 */
export async function extractChapters(
  pdfBase64: string,
  subjectLabel: string,
  totalPages: number | null,
): Promise<Chapter[]> {
  const prompt =
    `Tu reçois un document PDF de cours de ${subjectLabel}. ` +
    `Identifie la STRUCTURE pédagogique : chapitres, UAA, parties principales (PAS les sous-sections fines).` +
    ` Réponds en JSON : {"chapters": [{"title": "...", "pageStart": N, "pageEnd": M}, ...]}.` +
    ` Règles :` +
    ` 1) "title" = nom EXACT du chapitre tel qu'écrit dans le document (ex: "UAA 2 : Stoechiométrie", "Chapitre 3 - Acides et bases").` +
    ` 2) "pageStart"/"pageEnd" = numéros de page du PDF (1-indexé), pas les numéros affichés en bas de page si différents.` +
    ` 3) Exclus : page de garde, table des matières, index, glossaire, bibliographie, annexes correctifs.` +
    ` 4) Inclus uniquement le contenu pédagogique (chapitres avec théorie+exercices).` +
    ` 5) Les chapitres doivent être contigus et non-chevauchants.` +
    ` 6) Si le document n'a aucune structure claire (PDF flat), retourne UN SEUL chapitre titré "Document complet" couvrant toutes les pages.` +
    (totalPages ? ` Le document fait ${totalPages} pages.` : "");

  const response = await routeAIRequest("extract_chapters", prompt, {
    pdfBase64,
    requireVision: true,
    responseSchema: CHAPTERS_SCHEMA,
    maxTokens: 4096, // Petite output, marge confortable
    cacheTtlMs: 0,
  });

  const parsed = parseChaptersResponse(response.text);
  const chapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];

  // Validation & normalisation : on accepte uniquement les chapitres avec des
  // bornes cohérentes (start ≤ end, dans la plage du PDF si on connaît la taille).
  const valid = chapters
    .filter((c) => typeof c.title === "string" && c.title.trim().length > 0)
    .filter((c) => Number.isInteger(c.pageStart) && Number.isInteger(c.pageEnd))
    .filter((c) => c.pageStart >= 1 && c.pageEnd >= c.pageStart)
    .filter((c) => !totalPages || c.pageEnd <= totalPages)
    .map((c) => ({ title: c.title.trim(), pageStart: c.pageStart, pageEnd: c.pageEnd }));

  if (valid.length === 0) {
    // Fallback : Claude n'a rien trouvé d'exploitable → on traite tout comme 1 chapitre.
    return [
      {
        title: "Document complet",
        pageStart: 1,
        pageEnd: totalPages ?? 1,
      },
    ];
  }

  return valid;
}
