import type { AIProvider, AIRequest, AIResponse } from "./types";
import { callOpenAICompat } from "./openai-compat";

export function OpenRouterProvider(): AIProvider {
  return {
    id: "openrouter_free",
    supportsVision: false,
    euCompliant: false,
    generateText(req: AIRequest): Promise<AIResponse> {
      return callOpenAICompat(
        "https://openrouter.ai/api/v1",
        process.env.OPENROUTER_API_KEY ?? "",
        "meta-llama/llama-3.1-8b-instruct:free",
        "openrouter_free",
        req,
        {
          "HTTP-Referer": "https://schoolio.app",
          "X-Title": "Schoolio",
        },
      );
    },
  };
}
