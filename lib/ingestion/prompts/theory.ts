import type Anthropic from "@anthropic-ai/sdk";

export type TheoryPromptInput = {
  schoolId: string;
  programId: string;
  conceptName: string;
  conceptSlug: string;
  uaaCode: string;
  uaaLabel: string;
  syllabusContent: string; // chunked UAA text
};

/**
 * Build the Anthropic Messages request that asks Claude to generate
 * 4 paragraphs of theory for one concept, with strict provenance.
 *
 * Caller : the orchestrator (one BatchRequest per concept). The
 * returned params can be sent via batches.create or via a synchronous
 * messages.create in fast mode.
 */
export function buildTheoryPrompt(
  input: TheoryPromptInput
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Tu es Maïa, assistant IA pour le programme officiel FW-B (Fédération Wallonie-Bruxelles). Tu produis du contenu pédagogique pour le secondaire CESS G.

# Mission

Génère 4 paragraphes de théorie pour le concept "${input.conceptName}" (slug: ${input.conceptSlug}), sous-section de ${input.uaaCode} ${input.uaaLabel}.

Chaque paragraphe :
- 150-250 mots
- Style pédagogique direct, niveau secondaire CESS G
- Vocabulaire précis ; définit les termes techniques à leur première occurrence
- Pas de "Dans ce paragraphe..." ou méta-commentaire
- Si tu utilises une formule/équation, écris-la avec des caractères Unicode (ex : H₂O, ΔH, π, →) — pas de LaTeX, pas de \\(...\\)

# Provenance obligatoire (CRITIQUE)

Pour chaque paragraphe, tu DOIS fournir :
- soit \`source_quote\` : extrait verbatim (≤ 300 caractères) du syllabus ci-dessous
- soit \`source_concept_path\` : chemin du concept dans la hiérarchie du programme (ex : "${input.uaaCode} > ${input.uaaLabel} > ${input.conceptName}")

Si aucun verbatim n'est trouvable, utilise \`source_concept_path\`. Ne JAMAIS laisser les deux champs null — la base de données rejette les lignes sans provenance.

# Syllabus (extrait ${input.uaaCode})

${input.syllabusContent}

# Format de sortie

Retourne UNIQUEMENT du JSON valide, sans markdown fences, sans préambule, sans commentaire. Schéma :

{
  "paragraphs": [
    {
      "ordinal": 1,
      "content": "texte du paragraphe…",
      "source_quote": "extrait verbatim ou null",
      "source_concept_path": "${input.uaaCode} > … ou null"
    },
    {
      "ordinal": 2,
      "content": "…",
      "source_quote": "…",
      "source_concept_path": "…"
    },
    {
      "ordinal": 3,
      "content": "…",
      "source_quote": "…",
      "source_concept_path": "…"
    },
    {
      "ordinal": 4,
      "content": "…",
      "source_quote": "…",
      "source_concept_path": "…"
    }
  ]
}`,
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "{" }],
      },
    ],
  };
}
