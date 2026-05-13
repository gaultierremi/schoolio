import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase client so the store-outputs functions don't hit the network.
const upsert = vi.fn(async (_rows: unknown[]) => ({ error: null }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      upsert: (rows: unknown[], _opts: unknown) => upsert(rows),
    }),
  }),
}));

import { storeTheoryBlocks, type TheoryBlockInput } from "@/lib/ingestion/store-outputs";

const baseRow: TheoryBlockInput = {
  concept_id: "c-1",
  school_id: "s-1",
  paragraph_ordinal: 1,
  content: "valid content",
  source_quote: "extrait verbatim",
  source_concept_path: null,
  ingestion_job_id: "j-1",
};

describe("storeTheoryBlocks", () => {
  beforeEach(() => {
    upsert.mockClear();
  });

  it("inserts valid rows", async () => {
    const result = await storeTheoryBlocks([baseRow]);
    expect(result.inserted).toBe(1);
    expect(result.rejected).toBe(0);
  });

  it("rejects rows with no provenance", async () => {
    const bad = { ...baseRow, source_quote: null, source_concept_path: null };
    const result = await storeTheoryBlocks([bad]);
    expect(result.inserted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.rejections[0].reason).toMatch(/no provenance/i);
  });

  it("rejects rows with content over 4000 chars", async () => {
    const longContent = "x".repeat(4001);
    const result = await storeTheoryBlocks([{ ...baseRow, content: longContent }]);
    expect(result.rejected).toBe(1);
    expect(result.rejections[0].reason).toMatch(/length/i);
  });

  it("rejects rows with paragraph_ordinal out of bounds", async () => {
    const result = await storeTheoryBlocks([{ ...baseRow, paragraph_ordinal: 11 }]);
    expect(result.rejected).toBe(1);
    expect(result.rejections[0].reason).toMatch(/ordinal/i);
  });

  it("partial batch : some valid, some rejected", async () => {
    const rows = [
      baseRow,
      { ...baseRow, paragraph_ordinal: 2, source_quote: null, source_concept_path: null },
      { ...baseRow, paragraph_ordinal: 3, source_concept_path: "UAA1 > X" },
    ];
    const result = await storeTheoryBlocks(rows);
    expect(result.inserted).toBe(2);
    expect(result.rejected).toBe(1);
  });
});
