import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIProvider, AIRequest, AIResponse } from "./types";

function makeGeminiProvider(modelName: string, id: string): AIProvider {
  return {
    id,
    supportsVision: true,
    euCompliant: true,

    async generateText(req: AIRequest): Promise<AIResponse> {
      if (!process.env.GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY not configured");
      const t0 = Date.now();
      const gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

      const generationConfig: Record<string, unknown> = {
        maxOutputTokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.7,
      };

      if (req.jsonMode || req.responseSchema) {
        generationConfig.responseMimeType = "application/json";
        if (req.responseSchema) {
          generationConfig.responseSchema = req.responseSchema;
        }
      }

      const model = gemini.getGenerativeModel({
        model: modelName,
        generationConfig,
        ...(req.systemPrompt ? { systemInstruction: req.systemPrompt } : {}),
      });

      const parts: unknown[] = [];
      if (req.pdfBase64) {
        parts.push({
          inlineData: { data: req.pdfBase64, mimeType: req.mimeType ?? "application/pdf" },
        });
      }
      parts.push({ text: req.prompt });

      const result = await model.generateContent(
        parts as Parameters<typeof model.generateContent>[0],
      );
      const text = result.response.text();

      return {
        text,
        provider: id,
        latencyMs: Date.now() - t0,
        tokensUsed: result.response.usageMetadata?.totalTokenCount,
      };
    },
  };
}

/**
 * Identifiants de modèles Gemini — source unique pour tout le produit
 * (ai-router et appels directs comme lib/exercises/generate-exercises.ts).
 *
 * gemini-2.5-pro a été retiré côté Google (log prod 2026-09-14 : « [404 Not
 * Found] This model models/gemini-2.5-pro is no longer available to new users.
 * Please update your code to use models/gemini-3.1-pro-preview »). On suit la
 * recommandation du message. Le Flash n'était pas cité dans le log ; s'il est
 * retiré à son tour, la chaîne de fallback des appelants doit traiter le 404
 * comme un 429 (cf. isModelUnavailableError) plutôt que sortir en 500.
 */
export const GEMINI_PRO_MODEL = "gemini-3.1-pro-preview";
export const GEMINI_FLASH_MODEL = "gemini-2.5-flash";

export const GeminiProProvider = (): AIProvider => makeGeminiProvider(GEMINI_PRO_MODEL, "gemini_pro");
export const GeminiFlashProvider = (): AIProvider => makeGeminiProvider(GEMINI_FLASH_MODEL, "gemini_flash");
