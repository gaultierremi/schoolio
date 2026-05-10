import type { AIProvider, AIRequest, AIResponse } from "./types";
import { callOpenAICompat } from "./openai-compat";

export function CerebrasProvider(): AIProvider {
  return {
    id: "cerebras_llama",
    supportsVision: false,
    euCompliant: false,
    generateText(req: AIRequest): Promise<AIResponse> {
      return callOpenAICompat(
        "https://api.cerebras.ai/v1",
        process.env.CEREBRAS_API_KEY ?? "",
        "llama3.1-70b",
        "cerebras_llama",
        req,
      );
    },
  };
}
