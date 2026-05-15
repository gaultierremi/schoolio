// Vision Haiku 4.5 classification : pour chaque image extraite, retourne
// un JSON structure avec type (parmi 81 IMAGE_TYPES), description, confidence
// + LaTeX/SMILES/region selon le type.
// Cf docs/superpowers/specs/2026-05-15-pdf-images-strategy.md section 4.3

import Anthropic from "@anthropic-ai/sdk";
import { IMAGE_TYPES, isValidImageType, type ImageType } from "@/lib/pdf/image-types";

export type VisionClassification = {
  type: ImageType;
  subject_hint: string;
  description: string;
  key_elements: string[];
  pedagogical_use: string;
  confidence: number;
  ocr_text: string;
  latex_if_formula: string | null;
  smiles_if_molecule: string | null;
  topojson_region_hint: string | null;
};

const VISION_PROMPT = `Tu es un expert pedagogique CESS Belgique FWB (5eme/6eme, 16-18 ans).
Decris cette image extraite d'un syllabus scolaire.

Reponds en JSON strict (aucun texte hors JSON, pas de code fence) :
{
  "type": "<un type de la taxonomy>",
  "subject_hint": "chimie|math|physique|biologie|histoire|geographie|religion|philosophie|francais|neerlandais|anglais|allemand|latin|economie|arts|musique|autre",
  "description": "2-4 phrases. Si formule : transcription textuelle. Si scene : composition, epoque, personnages. Si carte : type, region, legende. Si schema : ce qui est represente, parties annotees.",
  "key_elements": ["liste", "des", "elements", "identifiables"],
  "pedagogical_use": "Quel type de question pedagogique cette image permet.",
  "confidence": 0.0-1.0,
  "ocr_text": "Texte present dans l'image (legendes, labels, formules en LaTeX si math).",
  "latex_if_formula": "Pour type=formula_* : transcription LaTeX. Sinon null.",
  "smiles_if_molecule": "Pour type=molecule_organic : SMILES si identifiable. Sinon null.",
  "topojson_region_hint": "Pour type=map_* : nom region principale (ex: 'Belgique', 'Wallonie', 'Europe', 'Monde'). Sinon null."
}

Types disponibles : ${IMAGE_TYPES.join(", ")}`;

type AnyParsed = {
  type?: unknown;
  subject_hint?: unknown;
  description?: unknown;
  key_elements?: unknown;
  pedagogical_use?: unknown;
  confidence?: unknown;
  ocr_text?: unknown;
  latex_if_formula?: unknown;
  smiles_if_molecule?: unknown;
  topojson_region_hint?: unknown;
};

function parseClassification(raw: string): AnyParsed {
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
  return {};
}

function normalize(parsed: AnyParsed): VisionClassification | null {
  if (!isValidImageType(parsed.type)) return null;
  return {
    type: parsed.type as ImageType,
    subject_hint: typeof parsed.subject_hint === "string" ? parsed.subject_hint : "autre",
    description: typeof parsed.description === "string" ? parsed.description.slice(0, 2000) : "",
    key_elements: Array.isArray(parsed.key_elements)
      ? parsed.key_elements.filter((e): e is string => typeof e === "string").slice(0, 20)
      : [],
    pedagogical_use: typeof parsed.pedagogical_use === "string" ? parsed.pedagogical_use.slice(0, 500) : "",
    confidence:
      typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
        ? parsed.confidence
        : 0.5,
    ocr_text: typeof parsed.ocr_text === "string" ? parsed.ocr_text.slice(0, 4000) : "",
    latex_if_formula:
      typeof parsed.latex_if_formula === "string" && parsed.latex_if_formula.length > 0
        ? parsed.latex_if_formula
        : null,
    smiles_if_molecule:
      typeof parsed.smiles_if_molecule === "string" && parsed.smiles_if_molecule.length > 0
        ? parsed.smiles_if_molecule
        : null,
    topojson_region_hint:
      typeof parsed.topojson_region_hint === "string" && parsed.topojson_region_hint.length > 0
        ? parsed.topojson_region_hint
        : null,
  };
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/**
 * Classify a single image via Anthropic Haiku 4.5 Vision.
 * Returns null if classification fails or response can't be parsed.
 * Cost : ~$0.001-0.002 per image.
 */
export async function classifyImage(pngBuffer: Buffer): Promise<VisionClassification | null> {
  const base64 = pngBuffer.toString("base64");
  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: base64 },
            },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
    });

    // Extract text content from the response
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const parsed = parseClassification(text);
    return normalize(parsed);
  } catch {
    return null;
  }
}
