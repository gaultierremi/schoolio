// Pre-pass Anthropic Haiku : identifier la TOC (chapitres + page ranges).
// Pivot 2026-05-14 : on bascule en TEXT-ONLY (texte extrait localement par
// pdfjs-dist) au lieu de PDF Vision. Anthropic Vision était trop lent sur
// PDF complet (200s+) et n'apportait pas de valeur pour identifier une TOC
// (qui est généralement listée en texte structuré dans les 1-3 premières pages).

import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { routeAIRequest } from "@/lib/ai-router";

export type Chapter = {
  title: string;
  pageStart: number;
  pageEnd: number;
};

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
 * Extrait la TOC depuis le TEXTE du PDF (déjà extrait localement par pdfjs).
 * On envoie un échantillon stratégique :
 *   - Les 5 premières pages (contient généralement la table des matières)
 *   - + des "samples" des pages 10, 30, 60... pour détecter les chapitres
 *     même si la TOC n'est pas explicitement listée
 *
 * Sample plutôt que texte complet pour rester en input tokens raisonnable
 * (~50K chars max) et fast (Haiku répond en 10-30s).
 */
export async function extractChapters(
  pagesText: string[],
  subjectLabel: string,
  totalPages: number,
): Promise<Chapter[]> {
  // Stratégie d'échantillonnage : prend les 5 premières pages + 1 page sur 10
  // ensuite. Garde aussi les 2 dernières pages (parfois annexes / TOC inversée).
  // Chaque page truncatée à 800 chars max pour rester compact.
  const samples: string[] = [];
  const seen = new Set<number>();

  function addPage(p: number, maxChars = 800) {
    if (seen.has(p) || p < 1 || p > pagesText.length) return;
    seen.add(p);
    const text = pagesText[p - 1] ?? "";
    samples.push(`## Page ${p}\n${text.slice(0, maxChars).trim()}`);
  }

  // Les 5 premières (TOC souvent ici)
  for (let p = 1; p <= Math.min(5, totalPages); p++) addPage(p, 1500);
  // Sample 1/10 ensuite
  for (let p = 10; p <= totalPages; p += 10) addPage(p, 600);
  // 2 dernières
  for (let p = Math.max(1, totalPages - 1); p <= totalPages; p++) addPage(p, 600);

  const samplesText = samples.join("\n\n---\n\n");

  const prompt =
    `Tu reçois des échantillons de texte d'un syllabus de cours de ${subjectLabel}, ${totalPages} pages au total.` +
    ` Tu vois les 5 premières pages (souvent la table des matières) puis 1 page sur 10 jusqu'à la fin.` +
    `\n\nIdentifie la STRUCTURE pédagogique : chapitres, UAA, parties principales.` +
    `\nRéponds en JSON : {"chapters": [{"title": "...", "pageStart": N, "pageEnd": M}, ...]}.` +
    `\n\nRègles :` +
    `\n1) "title" = nom EXACT du chapitre tel qu'écrit dans le document (ex: "UAA 2 : Stoechiométrie", "Chapitre 3 - Acides et bases").` +
    `\n2) "pageStart"/"pageEnd" = numéros de page du PDF (1-indexé) — déduits depuis les marqueurs "## Page N" et l'inférence sur les pages non-échantillonnées.` +
    `\n3) Exclus : page de garde, table des matières elle-même, index, glossaire, bibliographie, annexes correctifs.` +
    `\n4) Inclus uniquement le contenu pédagogique (chapitres avec théorie+exercices).` +
    `\n5) Les chapitres doivent être contigus et non-chevauchants.` +
    `\n6) Si aucune structure claire (document plat), retourne UN SEUL chapitre titré "Document complet" couvrant 1 à ${totalPages}.` +
    `\n\nÉchantillons :\n\n${samplesText}`;

  const response = await routeAIRequest("extract_chapters", prompt, {
    requireVision: false, // Text-only, pas besoin de provider Vision
    responseSchema: CHAPTERS_SCHEMA,
    maxTokens: 4096,
    cacheTtlMs: 0,
    model: "anthropic_haiku", // Haiku pour la vitesse, TOC est tâche simple
  });

  const parsed = parseChaptersResponse(response.text);
  const chapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];

  const valid = chapters
    .filter((c) => typeof c.title === "string" && c.title.trim().length > 0)
    .filter((c) => Number.isInteger(c.pageStart) && Number.isInteger(c.pageEnd))
    .filter((c) => c.pageStart >= 1 && c.pageEnd >= c.pageStart)
    .filter((c) => c.pageEnd <= totalPages)
    .map((c) => ({ title: c.title.trim(), pageStart: c.pageStart, pageEnd: c.pageEnd }));

  if (valid.length === 0) {
    return [
      {
        title: "Document complet",
        pageStart: 1,
        pageEnd: totalPages,
      },
    ];
  }

  return valid;
}
