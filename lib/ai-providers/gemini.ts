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

export const GeminiProProvider = (): AIProvider => makeGeminiProvider("gemini-2.5-pro", "gemini_pro");
export const GeminiFlashProvider = (): AIProvider => makeGeminiProvider("gemini-2.5-flash", "gemini_flash");
