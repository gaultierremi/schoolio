import { describe, it, expect } from "vitest";
import { hashPin, verifyPin, shouldFallbackSSO, isValidPinFormat } from "@/lib/auth/pin";

describe("isValidPinFormat", () => {
  it("accepts exactly 4 digits", () => {
    expect(isValidPinFormat("0000")).toBe(true);
    expect(isValidPinFormat("1234")).toBe(true);
    expect(isValidPinFormat("9999")).toBe(true);
  });

  it("rejects non-4-char input", () => {
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("12345")).toBe(false);
    expect(isValidPinFormat("")).toBe(false);
  });

  it("rejects non-digit input", () => {
    expect(isValidPinFormat("abcd")).toBe(false);
    expect(isValidPinFormat("12ab")).toBe(false);
    expect(isValidPinFormat("12-4")).toBe(false);
    expect(isValidPinFormat(" 1234")).toBe(false);
  });
});

describe("hashPin", () => {
  it("produces a bcrypt hash for a valid PIN", async () => {
    const hash = await hashPin("1234");
    // bcrypt hashes start with $2a$, $2b$, or $2y$ depending on version
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it("uses cost factor 12 (mémoire project_pin_auth_spec)", async () => {
    const hash = await hashPin("4567");
    // bcrypt format: $2X$XX$... where XX is the cost
    expect(hash.startsWith("$2a$12$") || hash.startsWith("$2b$12$") || hash.startsWith("$2y$12$")).toBe(true);
  });

  it("rejects invalid format with an error", async () => {
    await expect(hashPin("123")).rejects.toThrow();
    await expect(hashPin("abcd")).rejects.toThrow();
    await expect(hashPin("12345")).rejects.toThrow();
  });

  it("produces different hashes for the same PIN (salt randomization)", async () => {
    const h1 = await hashPin("1234");
    const h2 = await hashPin("1234");
    expect(h1).not.toBe(h2);
  });
});

describe("verifyPin", () => {
  it("returns true for the correct PIN", async () => {
    const hash = await hashPin("1234");
    expect(await verifyPin("1234", hash)).toBe(true);
  });

  it("returns false for the wrong PIN", async () => {
    const hash = await hashPin("1234");
    expect(await verifyPin("1235", hash)).toBe(false);
    expect(await verifyPin("0000", hash)).toBe(false);
  });

  it("returns false for an invalid PIN format (no throw)", async () => {
    const hash = await hashPin("1234");
    expect(await verifyPin("abc", hash)).toBe(false);
    expect(await verifyPin("12345", hash)).toBe(false);
    expect(await verifyPin("", hash)).toBe(false);
  });

  it("returns false for a malformed hash (no throw)", async () => {
    expect(await verifyPin("1234", "not-a-bcrypt-hash")).toBe(false);
    expect(await verifyPin("1234", "")).toBe(false);
  });
});

describe("shouldFallbackSSO", () => {
  it("returns false for 0, 1, 2 failed attempts", () => {
    expect(shouldFallbackSSO(0)).toBe(false);
    expect(shouldFallbackSSO(1)).toBe(false);
    expect(shouldFallbackSSO(2)).toBe(false);
  });

  it("returns true at 3 failed attempts (mémoire fallback after 3)", () => {
    expect(shouldFallbackSSO(3)).toBe(true);
    expect(shouldFallbackSSO(4)).toBe(true);
    expect(shouldFallbackSSO(100)).toBe(true);
  });
});
