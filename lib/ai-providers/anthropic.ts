import type { AIProvider, AIRequest, AIResponse } from "./types";

/**
 * Anthropic Claude provider pour ai-router. Supporte la Vision (PDF via
 * source.type: 'base64'). Utilisé en fallback quand Gemini Free Tier hit
 * son quota daily (429 too many requests).
 *
 * Modèle par défaut : claude-sonnet-4-6 (latest, vision native, structured
 * output via JSON mode). Pay-as-you-go — pas de quota par défaut, le budget
 * est géré côté billing Anthropic Console (€20 actuel).
 *
 * Le SDK Anthropic respecte le format messages.create avec content blocs
 * mixtes (document PDF + text) — c'est l'API "Files API direct base64".
 * Limite native : ~32MB en base64 pour les PDFs.
 */
export function makeAnthropicProvider(modelName: string, id: string): AIProvider {
  return {
    id,
    supportsVision: true,
    euCompliant: false, // US-based for now; Anthropic est en train de déployer EU regions, on bascule quand disponible
    async generateText(req: AIRequest): Promise<AIResponse> {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY not configured");
      }
      const t0 = Date.now();

      // Import dynamique pour éviter de charger le SDK quand un autre provider gagne
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic();

      // Build content array : document (si PDF) + text prompt
      const userContent: Array<Record<string, unknown>> = [];
      if (req.pdfBase64) {
        userContent.push({
          type: "document",
          source: {
            type: "base64",
            media_type: req.mimeType ?? "application/pdf",
            data: req.pdfBase64,
          },
        });
      }

      // Le prompt principal peut inclure une consigne JSON si responseSchema.
      // Contrairement à Gemini, Claude ne supporte pas nativement un
      // "responseSchema" enforcé — on instructe via le prompt et on parse
      // côté caller. Pour rester compatible avec routeAIRequest, on ajoute
      // une consigne de format JSON quand le caller demande jsonMode/schema.
      let finalPrompt = req.prompt;
      if (req.responseSchema || req.jsonMode) {
        finalPrompt = `${req.prompt}\n\nRESPOND WITH VALID JSON ONLY. No prose, no markdown fences, just the JSON object.`;
      }
      userContent.push({ type: "text", text: finalPrompt });

      // Anthropic exige streaming pour les ops > 10min (max_tokens élevé +
      // PDF Vision = lent). Sinon SDK throw :
      // "Streaming is required for operations that may take longer than 10 minutes".
      // Pattern identique à lib/pdf/extract-markdown.ts qui collecte via
      // .finalMessage() pour récupérer la même shape que messages.create().
      const stream = client.messages.stream({
        model: modelName,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.7,
        ...(req.systemPrompt ? { system: req.systemPrompt } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: [{ role: "user", content: userContent as any }],
      });
      const completion = await stream.finalMessage();

      const firstBlock = completion.content[0];
      const text = firstBlock && firstBlock.type === "text" ? firstBlock.text : "";

      return {
        text,
        provider: id,
        latencyMs: Date.now() - t0,
        tokensUsed:
          (completion.usage?.input_tokens ?? 0) +
          (completion.usage?.output_tokens ?? 0),
      };
    },
  };
}

export const AnthropicClaudeProvider = (): AIProvider =>
  makeAnthropicProvider("claude-sonnet-4-6", "anthropic_claude");
