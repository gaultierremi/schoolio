import { SignJWT, jwtVerify } from "jose";

/**
 * Cookie HttpOnly signé pour la fraîcheur du unlock PIN (Sprint 1A).
 *
 * Architecture (cf. plan Sprint 1A critique #1) :
 * - Après un PIN unlock réussi, on émet un JWT HS256 contenant { sub: userId }
 *   avec une TTL de 24h (re-auth quotidienne mémoire `project_pin_auth_spec`).
 * - Ce JWT est stocké dans un cookie HttpOnly `maia_pin_unlocked` signé par
 *   le serveur (PIN_COOKIE_SECRET).
 * - Le middleware vérifie juste ce cookie à chaque navigation. Aucune DB query
 *   ni bcrypt compare = 0 latence ajoutée vs Sprint 0.
 * - La DB n'est touchée qu'au moment du unlock (POST /api/auth/pin/verify).
 *
 * Le secret PIN_COOKIE_SECRET doit faire au moins 32 octets en prod (entropie
 * suffisante pour HS256). En dev local, n'importe quel string fonctionne.
 */

export const PIN_COOKIE_NAME = "maia_pin_unlocked";

function secretBytes(): Uint8Array {
  const raw = process.env.PIN_COOKIE_SECRET;
  if (!raw || raw.length === 0) {
    throw new Error(
      "PIN_COOKIE_SECRET env var manquante. Génère un secret 32+ chars et configure-le sur Vercel.",
    );
  }
  return new TextEncoder().encode(raw);
}

/**
 * Émet un JWT HS256 signé valide pour `ttlHours` heures.
 */
export async function signPinUnlockCookie(
  userId: string,
  ttlHours = 24,
): Promise<string> {
  const secret = secretBytes();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlHours * 3600;
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secret);
}

/**
 * Vérifie un JWT signé. Retourne `{ userId }` si valide + non-expiré, sinon `null`
 * (jamais d'exception — protège le middleware de leak d'info via la cause d'échec).
 */
export async function verifyPinUnlockCookie(
  token: string,
): Promise<{ userId: string } | null> {
  if (typeof token !== "string" || token.length === 0) return null;
  try {
    const secret = secretBytes();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    return { userId: payload.sub };
  } catch {
    // signature invalide, expiration dépassée, format malformed, secret manquant
    return null;
  }
}
