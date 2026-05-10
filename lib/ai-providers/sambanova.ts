import type { AIProvider, AIRequest, AIResponse } from "./types";
import { callOpenAICompat } from "./openai-compat";

export function SambanovaProvider(): AIProvider {
  return {
    id: "sambanova_llama",
    supportsVision: false,
    euCompliant: false,
    generateText(req: AIRequest): Promise<AIResponse> {
      return callOpenAICompat(
        "https://api.sambanova.ai/v1",
        process.env.SAMBANOVA_API_KEY ?? "",
        "Meta-Llama-3.1-405B-Instruct",
        "sambanova_llama",
        req,
      );
    },
  };
}
