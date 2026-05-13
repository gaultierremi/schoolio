import Anthropic from "@anthropic-ai/sdk";

export type DetectedSection = {
  /** Human-readable label of the section as it appears in the syllabus. */
  label: string;
  /** 1-indexed order in the document. */
  ordinal: number;
  /**
   * Verbatim first ~80 chars of the section's content (after the heading).
   * The orchestrator finds this substring in the markdown to determine where
   * the section begins.
   */
  start_marker: string;
  /**
   * Verbatim last ~80 chars of the section's content (before the next
   * section heading). The orchestrator finds this substring to determine
   * where the section ends.
   */
  end_marker: string;
  /**
   * Optional code derived from the document if any (e.g. "UAA5", "P3").
   * Null when the document doesn't use codes (e.g. Histoire FW-B periods).
   */
  code: string | null;
};

export type SectionChunk = DetectedSection & {
  /** The actual markdown content between start_marker and end_marker. */
  content: string;
};

/**
 * Ask Claude to identify the pedagogical sections of a syllabus markdown,
 * regardless of nomenclature (UAA / Compétence / Thème / Période / ...).
 *
 * Why Claude rather than regex per subject :
 *   - FW-B syllabi have wildly different structures across matières (Sciences
 *     uses UAA, Histoire uses thèmes & compétences, Français uses genres
 *     textuels, etc.)
 *   - Hardcoding regex per subject is fragile maintenance debt.
 *   - $0.005 per syllabus is negligible vs the engineering cost of supporting
 *     N matières × M regex variants.
 *   - Sprint 2 teacher curation will let the prof split/merge sections if
 *     Claude segments them differently than expected — the human stays in
 *     the loop.
 *
 * Returns the raw section metadata. Use `chunkSections` (below) to slice
 * the markdown by these markers.
 */
export async function detectSections(
  markdown: string,
  subject: string
): Promise<DetectedSection[]> {
  const client = new Anthropic();

  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Tu es un assistant pédagogique. Voici le markdown d'un programme officiel FW-B de ${subject}.

Identifie les sections pédagogiques principales (chapitres, UAAs, périodes historiques, compétences, thèmes, modules — peu importe la nomenclature utilisée par le document).

Règles strictes :

1. Ignore les introductions globales, préfaces, tables des matières, glossaires, annexes administratives, bibliographies. Concentre-toi UNIQUEMENT sur les sections qui contiennent du contenu pédagogique enseignable.

2. Chaque section doit être de granularité moyenne : ni trop fine (un sous-paragraphe), ni trop grosse (toute une partie de 50 pages). Vise 5-20 sections par syllabus typique.

3. Pour chaque section :
   - \`label\` : nom court et clair de la section (ex : "Antiquité", "UAA5 Réactions chimiques", "Compétence : Lire un texte argumentatif")
   - \`ordinal\` : numéro d'ordre 1, 2, 3, ... dans le document
   - \`start_marker\` : extrait VERBATIM des 80 premiers caractères du CONTENU de la section (juste après son titre) — ce texte sera utilisé pour localiser le début de la section dans le markdown brut, donc il doit matcher 1:1
   - \`end_marker\` : extrait VERBATIM des 80 derniers caractères du CONTENU de la section (juste avant la section suivante) — même critère, doit matcher 1:1
   - \`code\` : si le document utilise un code natif (UAA5, P3, etc.), le retourner ; sinon null

4. Les start_marker et end_marker doivent être DISTINCTS pour chaque section (pas de duplication).

5. Si tu n'es pas sûr du découpage à un endroit, préfère regrouper plutôt que sur-fragmenter — le prof pourra splitter plus tard en curation.

# Markdown du syllabus

${markdown}

# Format de sortie

JSON strict, sans markdown fences, sans préambule, sans commentaire :

{
  "sections": [
    {
      "label": "...",
      "ordinal": 1,
      "start_marker": "verbatim 80 chars du début du contenu",
      "end_marker": "verbatim 80 chars de la fin du contenu",
      "code": "UAA5" ou null
    }
  ]
}`,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "{" }],
      },
    ],
  });

  const response = await stream.finalMessage();
  const firstBlock = response.content[0];
  if (!firstBlock || firstBlock.type !== "text") {
    throw new Error("detectSections : Claude returned no text block");
  }

  const fullJson = "{" + firstBlock.text;
  const parsed = JSON.parse(fullJson) as { sections?: DetectedSection[] };

  const sections = parsed.sections ?? [];
  if (sections.length === 0) {
    throw new Error("detectSections : Claude found 0 sections — check the syllabus or the prompt");
  }

  return sections;
}

/**
 * Slice the markdown into per-section chunks based on the detected markers.
 *
 * If a marker doesn't match (Claude returned a near-quote that's slightly
 * different from the source), we fall back to ordinal-based fixed-width
 * chunking for that section : we slice from where the previous section ended
 * to a heuristic boundary.
 */
export function chunkSections(
  markdown: string,
  sections: DetectedSection[]
): SectionChunk[] {
  const chunks: SectionChunk[] = [];

  // Sort by ordinal to be safe
  const sorted = [...sections].sort((a, b) => a.ordinal - b.ordinal);

  for (let i = 0; i < sorted.length; i++) {
    const section = sorted[i];
    let startIdx = markdown.indexOf(section.start_marker);
    let endIdx = markdown.indexOf(section.end_marker);

    // Fallback when markers don't match exactly
    if (startIdx === -1) {
      // Try a shorter prefix (first 30 chars) — Claude sometimes paraphrases
      const shorter = section.start_marker.slice(0, 30).trim();
      startIdx = shorter.length > 5 ? markdown.indexOf(shorter) : -1;
    }
    if (endIdx === -1) {
      const shorter = section.end_marker.slice(-30).trim();
      endIdx = shorter.length > 5 ? markdown.indexOf(shorter) : -1;
    }

    // Last-ditch fallback : if previous chunk has an end position, start from there
    if (startIdx === -1 && i > 0) {
      const prevEnd = chunks[i - 1] ? markdown.indexOf(chunks[i - 1].end_marker) : -1;
      if (prevEnd > 0) startIdx = prevEnd + chunks[i - 1].end_marker.length;
    }

    if (startIdx === -1) {
      // Skip this section — can't locate it
      continue;
    }

    // If endIdx not found, use the start of the next section's start_marker
    if (endIdx === -1) {
      const next = sorted[i + 1];
      if (next) {
        const nextStart = markdown.indexOf(next.start_marker);
        if (nextStart > startIdx) endIdx = nextStart;
      }
    }
    if (endIdx === -1) {
      // Last section : take everything until end of markdown
      endIdx = markdown.length;
    } else {
      endIdx += section.end_marker.length;
    }

    if (endIdx <= startIdx) continue;

    chunks.push({
      ...section,
      content: markdown.slice(startIdx, endIdx).trim(),
    });
  }

  return chunks;
}
