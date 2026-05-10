import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PIN_DIGITS = 6;
const PIN_MAX = 10 ** PIN_DIGITS;
const SCRYPT_KEYLEN = 32;
const SALT_BYTES = 16;

/**
 * Generates a random 6-digit numeric PIN as a zero-padded string.
 * Used for light account reconnect proof-of-possession.
 */
export function generateReconnectPin(): string {
  // crypto.randomInt isn't available in all Node versions on Vercel;
  // randomBytes is universally safe and good enough for 6-digit pins.
  const buf = randomBytes(4);
  const value = buf.readUInt32BE(0) % PIN_MAX;
  return value.toString().padStart(PIN_DIGITS, "0");
}

/**
 * Hashes a PIN with scrypt and a per-PIN random salt.
 * Returns a string suitable for storage in user_profiles.reconnect_pin_hash.
 */
export function hashReconnectPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(pin, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * Verifies a candidate PIN against the stored salt:hash blob using
 * constant-time comparison. Returns false on any malformed input.
 */
export function verifyReconnectPin(candidate: string, stored: string): boolean {
  if (typeof candidate !== "string" || typeof stored !== "string") return false;
  if (!/^\d{6}$/.test(candidate)) return false;

  const parts = stored.split(":");
  if (parts.length !== 2) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[0], "hex");
    expected = Buffer.from(parts[1], "hex");
  } catch {
    return false;
  }
  if (salt.length !== SALT_BYTES || expected.length !== SCRYPT_KEYLEN) return false;

  const candidateHash = scryptSync(candidate, salt, SCRYPT_KEYLEN);
  return timingSafeEqual(candidateHash, expected);
}
