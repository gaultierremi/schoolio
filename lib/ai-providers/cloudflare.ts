import type { AIProvider, AIRequest, AIResponse } from "./types";

export function CloudflareProvider(): AIProvider {
  return {
    id: "cloudflare_ai",
    supportsVision: false,
    euCompliant: false,

    async generateText(req: AIRequest): Promise<AIResponse> {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      if (!accountId || !apiToken) throw new Error("Cloudflare credentials not configured");

      const t0 = Date.now();
      const messages: Array<{ role: string; content: string }> = [];
      if (req.systemPrompt) messages.push({ role: "system", content: req.systemPrompt });
      messages.push({ role: "user", content: req.prompt });

      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages }),
        },
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`${res.status}: ${errorText}`);
      }

      const data = (await res.json()) as {
        result?: { response?: string };
        success?: boolean;
      };

      return {
        text: data.result?.response ?? "",
        provider: "cloudflare_ai",
        latencyMs: Date.now() - t0,
      };
    },
  };
}
