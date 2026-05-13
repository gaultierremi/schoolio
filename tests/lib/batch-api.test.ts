import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the @anthropic-ai/sdk module BEFORE importing our wrapper
vi.mock("@anthropic-ai/sdk", () => {
  const batches = {
    create: vi.fn(async ({ requests }: { requests: { custom_id: string }[] }) => ({
      id: "batch_test_abc123",
      processing_status: "in_progress",
      request_counts: { processing: requests.length, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
    })),
    retrieve: vi.fn(async () => ({
      id: "batch_test_abc123",
      processing_status: "ended",
      request_counts: { processing: 0, succeeded: 2, errored: 0, canceled: 0, expired: 0 },
    })),
    results: vi.fn(async function* () {
      yield {
        custom_id: "concept-1",
        result: {
          type: "succeeded",
          message: {
            id: "msg_1",
            content: [{ type: "text", text: '"hello"' }],
            role: "assistant",
            model: "claude-sonnet-4-6",
            stop_reason: "end_turn",
            stop_sequence: null,
            type: "message",
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
      };
      yield {
        custom_id: "concept-2",
        result: {
          type: "errored",
          error: { type: "invalid_request_error", message: "Test error" },
        },
      };
    }),
  };
  const Anthropic = vi.fn(() => ({ messages: { batches } }));
  return { default: Anthropic };
});

import { createBatch, getBatchStatus, getBatchResults } from "@/lib/ingestion/batch-api";

describe("batch-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createBatch returns batch id", async () => {
    const id = await createBatch([
      {
        custom_id: "concept-1",
        params: {
          model: "claude-sonnet-4-6",
          max_tokens: 100,
          messages: [{ role: "user", content: "hi" }],
        },
      },
    ]);
    expect(id).toBe("batch_test_abc123");
  });

  it("createBatch throws on empty requests", async () => {
    await expect(createBatch([])).rejects.toThrow(/empty/i);
  });

  it("getBatchStatus returns processing_status + counts", async () => {
    const status = await getBatchStatus("batch_test_abc123");
    expect(status.status).toBe("ended");
    expect(status.request_counts.succeeded).toBe(2);
    expect(status.request_counts.processing).toBe(0);
  });

  it("getBatchResults yields succeeded + errored results", async () => {
    const results = await getBatchResults("batch_test_abc123");
    expect(results).toHaveLength(2);
    expect(results[0].custom_id).toBe("concept-1");
    expect(results[0].result.type).toBe("succeeded");
    expect(results[1].custom_id).toBe("concept-2");
    expect(results[1].result.type).toBe("errored");
  });
});
