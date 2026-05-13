import { randomBytes } from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no I/O/0/1 confusion
const CODE_LEN = 6;

/**
 * Generate a 6-char join code for a live session. Crypto-secure
 * (CLAUDE.md rule 9 — never RANDOM()/Math.random for codes).
 *
 * 32^6 ≈ 1B combinations. Collision probability acceptable for dogfood
 * scale; if it grows to 1000s of concurrent sessions, switch to a
 * uniqueness check loop or longer code.
 */
export function generateLiveSessionCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Random pick of one element from an array, crypto-secure
 * (anti-bias for picking students fairly during a live session).
 */
export function pickRandom<T>(items: readonly T[]): T | null {
  if (items.length === 0) return null;
  const buf = randomBytes(4);
  const u32 = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
  // Use unsigned shift to avoid negative index from signed 32-bit overflow.
  return items[(u32 >>> 0) % items.length];
}
