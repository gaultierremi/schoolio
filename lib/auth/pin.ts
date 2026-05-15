import bcrypt from "bcryptjs";

/**
 * PIN secondaire pour double-auth Maïa (Sprint 1A).
 *
 * Spec (mémoire `project_pin_auth_spec`) :
 * - Format : exactement 4 chiffres (0-9)
 * - Hash : bcrypt cost 12 (~150ms par check, équilibre UX/sécu)
 * - Fallback SSO obligatoire après 3 échecs consécutifs
 * - Un seul PIN partagé par user (table `user_pin`, cf. migration 20260516000000)
 *
 * IMPORTANT : ce module ne fait JAMAIS d'I/O. Toutes les fonctions sont pures.
 * Les hash/verify délèguent à bcrypt mais ne touchent pas la DB. C'est l'appelant
 * (route handler) qui orchestre le fetch/update du row user_pin.
 */

const PIN_REGEX = /^[0-9]{4}$/;
const BCRYPT_COST = 12;
const FALLBACK_SSO_THRESHOLD = 3;

/**
 * Validation stricte : exactement 4 chiffres (pas de lettres, pas d'espaces).
 */
export function isValidPinFormat(pin: string): boolean {
  return typeof pin === "string" && PIN_REGEX.test(pin);
}

/**
 * Hash un PIN avec bcrypt cost 12. Lève une erreur si format invalide.
 *
 * @throws Error si pin n'est pas exactement 4 chiffres.
 */
export async function hashPin(pin: string): Promise<string> {
  if (!isValidPinFormat(pin)) {
    throw new Error("PIN doit être exactement 4 chiffres");
  }
  return bcrypt.hash(pin, BCRYPT_COST);
}

/**
 * Vérifie qu'un PIN correspond au hash stocké. Retourne false sur format
 * invalide ou hash corrompu (jamais d'exception propagée — protège l'API
 * route de leak d'info via la nature de l'erreur).
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!isValidPinFormat(pin)) return false;
  if (typeof hash !== "string" || hash.length === 0) return false;
  try {
    return await bcrypt.compare(pin, hash);
  } catch {
    return false;
  }
}

/**
 * Décide si on doit forcer le fallback SSO après N échecs.
 * Mémoire `project_pin_auth_spec` : seuil à 3 échecs consécutifs.
 */
export function shouldFallbackSSO(failedAttempts: number): boolean {
  return failedAttempts >= FALLBACK_SSO_THRESHOLD;
}
