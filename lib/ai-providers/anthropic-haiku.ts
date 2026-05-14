// lib/ai-providers/anthropic-haiku.ts
//
// Anthropic Claude Haiku 4.5 provider — modèle rapide + low-cost.
// Utilisé pour les tâches simples (extraction TOC d'un PDF) où la qualité
// Sonnet est overkill. ~3-5x plus rapide que Sonnet, ~10x moins cher.

import type { AIProvider, AIRequest, AIResponse } from "./types";

function makeAnthropicHaikuProvider(modelName: string, id: string): AIProvider {
  return {
    id,
    supportsVision: true,
    euCompliant: false,
    async generateText(req: AIRequest): Promise<AIResponse> {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY not configured");
      }
      const t0 = Date.now();

      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic();

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

      let finalPrompt = req.prompt;
      if (req.responseSchema || req.jsonMode) {
        finalPrompt = `${req.prompt}\n\nRESPOND WITH VALID JSON ONLY. No prose, no markdown fences, just the JSON object.`;
      }
      userContent.push({ type: "text", text: finalPrompt });

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

export const AnthropicHaikuProvider = (): AIProvider =>
  makeAnthropicHaikuProvider("claude-haiku-4-5-20251001", "anthropic_haiku");
