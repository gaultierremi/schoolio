import { createHmac, timingSafeEqual } from "crypto";

// Cookie format: "<email>.<exp_unix_seconds>.<hmac_hex>"
//   - email is the user's verified email at the time of issue
//   - exp_unix_seconds is when the cookie should be considered expired
//   - hmac is HMAC-SHA256(BETA_COOKIE_SECRET, "<email>.<exp>") in hex
//
// Why HMAC: the previous version compared the cookie value to user.email by
// string equality. Any authenticated user could set
// `document.cookie = "beta-checked=<my-email>; path=/"` from a controlled
// surface (subdomain, future XSS, dev-tools paste) and bypass the entire
// beta whitelist gate.
//
// HMAC makes the cookie unforgeable without the server secret. We embed the
// expiry inside the signed payload so we don't have to trust the cookie's
// own Max-Age (which the client controls).
//
// We accept the cookie for any path bound to the email of the currently
// signed-in user — so if the user signs in as someone else, the cookie no
// longer matches and the gate runs again.

const SECRET = process.env.BETA_COOKIE_SECRET;
const TTL_SECONDS = 3600;

function hmac(payload: string): string {
  if (!SECRET) {
    throw new Error("BETA_COOKIE_SECRET is not set");
  }
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function signBetaCookie(email: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${email}.${exp}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyBetaCookie(value: string | undefined, email: string): boolean {
  if (!value || !SECRET) return false;

  const lastDot = value.lastIndexOf(".");
  if (lastDot < 0) return false;
  const payload = value.slice(0, lastDot);
  const candidateMac = value.slice(lastDot + 1);

  // Verify shape: email.exp
  const firstDot = payload.indexOf(".");
  if (firstDot < 0) return false;
  const cookieEmail = payload.slice(0, firstDot);
  const expStr = payload.slice(firstDot + 1);

  if (cookieEmail !== email) return false;

  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const expectedMac = hmac(payload);
  // timingSafeEqual requires equal-length buffers; bail early on mismatch.
  if (candidateMac.length !== expectedMac.length) return false;

  return timingSafeEqual(Buffer.from(candidateMac, "hex"), Buffer.from(expectedMac, "hex"));
}

export const BETA_COOKIE_MAX_AGE = TTL_SECONDS;
