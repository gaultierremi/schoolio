import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Simple AI router for the Cockpit POC.
// Primary: Anthropic claude-haiku-4-5 (fast, cost-effective for real-time features)
// Fallback: Google Gemini Flash
// Returns { text: string } — callers extract and parse as needed.

export type AIRouterOptions = {
  maxTokens?: number;
  temperature?: number;
  cacheTtlMs?: number; // reserved — not used at request level
  jsonMode?: boolean;  // hints to return JSON only
};

export type AIRouterResult = {
  text: string;
  provider: "anthropic" | "gemini";
};

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const GEMINI_MODEL = "gemini-2.0-flash";

function anthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

function geminiClient() {
  return new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY ?? "");
}

async function callAnthropic(
  prompt: string,
  opts: AIRouterOptions,
): Promise<string> {
  const client = anthropicClient();
  const systemHint = opts.jsonMode
    ? "Tu es un assistant pédagogique. Réponds UNIQUEMENT avec du JSON valide, sans texte avant ni après."
    : "Tu es un assistant pédagogique expert.";

  const msg = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.7,
    system: systemHint,
    messages: [{ role: "user", content: prompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected Anthropic response type");
  return block.text;
}

async function callGemini(
  prompt: string,
  opts: AIRouterOptions,
): Promise<string> {
  const client = geminiClient();
  const model = client.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function routeAIRequest(
  _context: string,
  prompt: string,
  opts: AIRouterOptions = {},
): Promise<AIRouterResult> {
  // Try Anthropic first
  try {
    const text = await callAnthropic(prompt, opts);
    return { text, provider: "anthropic" };
  } catch (primaryErr) {
    console.warn(`[ai-router] Anthropic failed (${_context}):`, primaryErr);
  }

  // Fallback to Gemini
  try {
    const text = await callGemini(prompt, opts);
    return { text, provider: "gemini" };
  } catch (fallbackErr) {
    console.error(`[ai-router] All providers failed (${_context}):`, fallbackErr);
    throw new Error(`AI unavailable for context: ${_context}`);
  }
}
