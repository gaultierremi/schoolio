import type { AIRequest, AIResponse } from "./types";

export async function callOpenAICompat(
  baseUrl: string,
  apiKey: string,
  model: string,
  providerId: string,
  req: AIRequest,
  extraHeaders?: Record<string, string>,
): Promise<AIResponse> {
  if (!apiKey) throw new Error(`API key not configured for ${providerId}`);
  const t0 = Date.now();

  const messages: Array<{ role: string; content: string }> = [];
  if (req.systemPrompt) messages.push({ role: "system", content: req.systemPrompt });
  messages.push({ role: "user", content: req.prompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: req.maxTokens ?? 2048,
    temperature: req.temperature ?? 0.7,
  };
  if (req.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { total_tokens?: number };
  };

  return {
    text: data.choices[0]?.message?.content ?? "",
    tokensUsed: data.usage?.total_tokens,
    latencyMs: Date.now() - t0,
    provider: providerId,
  };
}
