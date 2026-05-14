import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import type { AIProvider, AIRequest, AIResponse } from "./ai-providers/types";
import { GeminiProProvider, GeminiFlashProvider } from "./ai-providers/gemini";
import { MistralProvider } from "./ai-providers/mistral";
import { CerebrasProvider } from "./ai-providers/cerebras";
import { GroqLlamaProvider, GroqGemmaProvider } from "./ai-providers/groq";
import { SambanovaProvider } from "./ai-providers/sambanova";
import { OpenRouterProvider } from "./ai-providers/openrouter";
import { CloudflareProvider } from "./ai-providers/cloudflare";
import { AnthropicClaudeProvider } from "./ai-providers/anthropic";

export type { AIResponse } from "./ai-providers/types";

export class GracefulAIError extends Error {
  constructor(
    message: string,
    public readonly taskType: string,
    public readonly providersAttempted: string[],
  ) {
    super(message);
    this.name = "GracefulAIError";
  }
}

export interface RouteOptions {
  systemPrompt?: string;
  pdfBase64?: string;
  mimeType?: string;
  responseSchema?: unknown;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  requireVision?: boolean;
  requireEuCompliant?: boolean;
  /** Cache TTL in ms. Default 24h. Set to 0 to disable cache. Vision tasks are never cached. */
  cacheTtlMs?: number;
}

const ALL_PROVIDERS: AIProvider[] = [
  AnthropicClaudeProvider(),
  GeminiProProvider(),
  GeminiFlashProvider(),
  MistralProvider(),
  CerebrasProvider(),
  GroqLlamaProvider(),
  GroqGemmaProvider(),
  SambanovaProvider(),
  OpenRouterProvider(),
  CloudflareProvider(),
];

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function hashPrompt(taskType: string, prompt: string): string {
  return createHash("sha256").update(`${taskType}|${prompt}`).digest("hex");
}

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("429") || /rate.?limit|quota|resource.?exhausted/i.test(msg);
}

export async function routeAIRequest(
  taskType: string,
  prompt: string,
  options: RouteOptions = {},
): Promise<AIResponse> {
  const admin = createAdminClient();
  const forcedId = process.env.AI_FORCE_PROVIDER;
  const cacheTtlMs = options.cacheTtlMs ?? 86_400_000;
  const isVision = Boolean(options.pdfBase64);
  const promptHash = hashPrompt(taskType, prompt);
  const now = new Date();

  // Cache lookup — text-only tasks only, skip when force provider is set
  if (!forcedId && cacheTtlMs > 0 && !isVision) {
    const { data: cached } = await admin
      .from("ai_response_cache")
      .select("response_text, hit_count")
      .eq("prompt_hash", promptHash)
      .eq("task_type", taskType)
      .gt("expires_at", now.toISOString())
      .maybeSingle();

    if (cached) {
      await Promise.all([
        admin
          .from("ai_response_cache")
          .update({ hit_count: cached.hit_count + 1 })
          .eq("prompt_hash", promptHash),
        admin.from("ai_request_logs").insert({
          provider_id: null,
          task_type: taskType,
          prompt_hash: promptHash,
          tokens_used: null,
          latency_ms: 0,
          status: "cached",
          error_message: null,
        }),
      ]);
      return { text: cached.response_text, provider: "cache", latencyMs: 0 };
    }
  }

  // Build candidate list
  let candidates: AIProvider[];
  if (forcedId) {
    const forced = ALL_PROVIDERS.find((p) => p.id === forcedId);
    if (!forced) {
      throw new GracefulAIError(
        `AI_FORCE_PROVIDER '${forcedId}' n'est pas un fournisseur connu`,
        taskType,
        [],
      );
    }
    candidates = [forced];
  } else {
    candidates = ALL_PROVIDERS.filter((p) => {
      if (options.requireVision && !p.supportsVision) return false;
      if (options.requireEuCompliant && !p.euCompliant) return false;
      return true;
    });
  }

  // Load quota/cooldown state from DB
  const { data: quotas } = await admin
    .from("ai_provider_quotas")
    .select("id, requests_today, daily_limit, cooldown_until, last_reset_at, priority")
    .in("id", candidates.map((p) => p.id));

  const quotaMap = new Map((quotas ?? []).map((q) => [q.id, q]));

  // Daily quota auto-reset
  const today = now.toISOString().slice(0, 10);
  const toReset = (quotas ?? []).filter((q) => q.last_reset_at !== today);
  if (toReset.length > 0) {
    await admin
      .from("ai_provider_quotas")
      .update({ requests_today: 0, last_reset_at: today })
      .in("id", toReset.map((q) => q.id));
    toReset.forEach((q) => quotaMap.set(q.id, { ...q, requests_today: 0 }));
  }

  // Sort by DB priority, then filter out unavailable providers
  const available = candidates
    .slice()
    .sort((a, b) => (quotaMap.get(a.id)?.priority ?? 99) - (quotaMap.get(b.id)?.priority ?? 99))
    .filter((p) => {
      const q = quotaMap.get(p.id);
      if (!q) return true;
      if (q.cooldown_until && new Date(q.cooldown_until) > now) return false;
      if (q.requests_today >= q.daily_limit) return false;
      return true;
    });

  const aiReq: AIRequest = {
    prompt,
    systemPrompt: options.systemPrompt,
    pdfBase64: options.pdfBase64,
    mimeType: options.mimeType,
    responseSchema: options.responseSchema,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    jsonMode: options.jsonMode,
  };

  const attempted: string[] = [];

  for (const provider of available) {
    attempted.push(provider.id);
    const t0 = Date.now();
    try {
      const response = await provider.generateText(aiReq);
      const latencyMs = Date.now() - t0;
      const currentCount = quotaMap.get(provider.id)?.requests_today ?? 0;

      await Promise.all([
        admin
          .from("ai_provider_quotas")
          .update({ requests_today: currentCount + 1 })
          .eq("id", provider.id),
        admin.from("ai_request_logs").insert({
          provider_id: provider.id,
          task_type: taskType,
          prompt_hash: promptHash,
          tokens_used: response.tokensUsed ?? null,
          latency_ms: latencyMs,
          status: "success",
          error_message: null,
        }),
      ]);

      // Cache write for text-only successes
      if (cacheTtlMs > 0 && !isVision) {
        const expiresAt = new Date(Date.now() + cacheTtlMs).toISOString();
        await admin.from("ai_response_cache").upsert({
          prompt_hash: promptHash,
          task_type: taskType,
          response_text: response.text,
          hit_count: 0,
          created_at: now.toISOString(),
          expires_at: expiresAt,
        });
        if (Math.random() < 0.01) {
          await admin.from("ai_response_cache").delete().lt("expires_at", now.toISOString());
        }
      }

      return response;
    } catch (err) {
      const latencyMs = Date.now() - t0;
      const isQuota = isRateLimitError(err);

      if (isQuota) {
        const cooldownUntil = new Date(Date.now() + 3_600_000).toISOString();
        await admin
          .from("ai_provider_quotas")
          .update({ cooldown_until: cooldownUntil })
          .eq("id", provider.id);
      }

      await admin.from("ai_request_logs").insert({
        provider_id: provider.id,
        task_type: taskType,
        prompt_hash: promptHash,
        tokens_used: null,
        latency_ms: latencyMs,
        status: isQuota ? "quota_exceeded" : "error",
        error_message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  throw new GracefulAIError(
    `Tous les fournisseurs IA sont indisponibles pour la tâche : ${taskType}`,
    taskType,
    attempted,
  );
}
