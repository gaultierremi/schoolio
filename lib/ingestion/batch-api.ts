import Anthropic from "@anthropic-ai/sdk";

export type BatchRequest = {
  custom_id: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
};

export type BatchResult = {
  custom_id: string;
  result:
    | { type: "succeeded"; message: Anthropic.Messages.Message }
    | { type: "errored"; error: { type: string; message: string } }
    | { type: "canceled" }
    | { type: "expired" };
};

export type BatchStatus = {
  status: "in_progress" | "canceling" | "ended";
  request_counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
};

/**
 * Create a new Anthropic Messages Batch. Returns the batch ID.
 *
 * Caller is responsible for : pinning a model on each request's params,
 * setting max_tokens, and using a stable custom_id (typically the concept_id).
 */
export async function createBatch(requests: BatchRequest[]): Promise<string> {
  if (requests.length === 0) {
    throw new Error("createBatch: requests array is empty");
  }
  const client = new Anthropic();
  const batch = await client.messages.batches.create({
    requests: requests.map((r) => ({
      custom_id: r.custom_id,
      params: r.params,
    })),
  });
  return batch.id;
}

/**
 * Poll a batch's status. Use the returned `request_counts` to render
 * progress in the UI; once `status === "ended"`, call getBatchResults.
 */
export async function getBatchStatus(batchId: string): Promise<BatchStatus> {
  const client = new Anthropic();
  const batch = await client.messages.batches.retrieve(batchId);
  return {
    status: batch.processing_status,
    request_counts: batch.request_counts,
  };
}

/**
 * Fetch the results of a completed batch. The result stream yields one
 * BatchResult per submitted request. Order is not guaranteed; match
 * results to requests by custom_id.
 */
export async function getBatchResults(batchId: string): Promise<BatchResult[]> {
  const client = new Anthropic();
  const stream = await client.messages.batches.results(batchId);
  const results: BatchResult[] = [];
  for await (const result of stream) {
    results.push(result as unknown as BatchResult);
  }
  return results;
}
