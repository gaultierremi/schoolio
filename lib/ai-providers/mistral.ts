import type { AIProvider, AIRequest, AIResponse } from "./types";
import { callOpenAICompat } from "./openai-compat";

export function MistralProvider(): AIProvider {
  return {
    id: "mistral_large",
    supportsVision: false,
    euCompliant: true,
    generateText(req: AIRequest): Promise<AIResponse> {
      return callOpenAICompat(
        "https://api.mistral.ai/v1",
        process.env.MISTRAL_API_KEY ?? "",
        "mistral-large-latest",
        "mistral_large",
        req,
      );
    },
  };
}
