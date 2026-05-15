import { describe, it, expect, beforeEach, vi } from "vitest";

// Force a known secret BEFORE importing the module
process.env.PIN_COOKIE_SECRET = "test-secret-32-bytes-long-aaaaaa";

import {
  signPinUnlockCookie,
  verifyPinUnlockCookie,
  PIN_COOKIE_NAME,
} from "@/lib/auth/pin-cookie";

describe("PIN_COOKIE_NAME", () => {
  it("is the canonical cookie name", () => {
    expect(PIN_COOKIE_NAME).toBe("maia_pin_unlocked");
  });
});

describe("signPinUnlockCookie + verifyPinUnlockCookie roundtrip", () => {
  it("returns the same user id after sign+verify", async () => {
    const token = await signPinUnlockCookie("user-123", 24);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3); // JWT compact form: header.payload.sig

    const result = await verifyPinUnlockCookie(token);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe("user-123");
  });

  it("returns null for a tampered signature", async () => {
    const token = await signPinUnlockCookie("user-456", 24);
    const parts = token.split(".");
    // tamper signature
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}XX`;
    expect(await verifyPinUnlockCookie(tampered)).toBeNull();
  });

  it("returns null for a malformed token", async () => {
    expect(await verifyPinUnlockCookie("not-a-jwt")).toBeNull();
    expect(await verifyPinUnlockCookie("")).toBeNull();
    expect(await verifyPinUnlockCookie("a.b.c")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    // sign with negative TTL → already expired
    const expiredToken = await signPinUnlockCookie("user-789", -1);
    expect(await verifyPinUnlockCookie(expiredToken)).toBeNull();
  });
});

describe("signPinUnlockCookie requires PIN_COOKIE_SECRET", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws if secret env var is missing", async () => {
    const original = process.env.PIN_COOKIE_SECRET;
    delete process.env.PIN_COOKIE_SECRET;
    vi.resetModules();
    const mod = await import("@/lib/auth/pin-cookie");
    await expect(mod.signPinUnlockCookie("u", 24)).rejects.toThrow();
    process.env.PIN_COOKIE_SECRET = original;
  });
});
