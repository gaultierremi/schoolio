import type { AIProvider, AIRequest, AIResponse } from "./types";
import { callOpenAICompat } from "./openai-compat";

export function GroqLlamaProvider(): AIProvider {
  return {
    id: "groq_llama",
    supportsVision: false,
    euCompliant: false,
    generateText(req: AIRequest): Promise<AIResponse> {
      return callOpenAICompat(
        "https://api.groq.com/openai/v1",
        process.env.GROQ_API_KEY ?? "",
        "llama-3.1-70b-versatile",
        "groq_llama",
        req,
      );
    },
  };
}

export function GroqGemmaProvider(): AIProvider {
  return {
    id: "groq_gemma",
    supportsVision: false,
    euCompliant: false,
    generateText(req: AIRequest): Promise<AIResponse> {
      return callOpenAICompat(
        "https://api.groq.com/openai/v1",
        process.env.GROQ_API_KEY ?? "",
        "gemma2-9b-it",
        "groq_gemma",
        req,
      );
    },
  };
}
