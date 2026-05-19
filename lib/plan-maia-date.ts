/**
 * Helper de date Plan Maïa — gère la timezone Europe/Brussels.
 *
 * B3 fix : `todayIsoDate()` UTC-only causait un bug entre 00h-02h locale
 * où l'élève voyait le plan d'hier au lieu d'aujourd'hui.
 *
 * Memo `project_pin_auth_spec` impose "timezone user" pour les rollover.
 */

const BELGIUM_TIMEZONE = "Europe/Brussels";

/**
 * Retourne la date courante en ISO (YYYY-MM-DD) selon la timezone Europe/Brussels.
 *
 * Exemple : 18 mai 2026 00:30 Belgique (UTC+2 été) → "2026-05-18".
 * Avant fix : new Date().toISOString().slice(0,10) renvoyait "2026-05-17"
 * car UTC = 22:30 le 17.
 */
export function todayInBelgium(): string {
  return formatIsoDateInBelgium(new Date());
}

/**
 * Formatte une date arbitraire en ISO YYYY-MM-DD selon Europe/Brussels.
 * Sépare la conversion timezone du `new Date()` pour testabilité.
 */
export function formatIsoDateInBelgium(date: Date): string {
  const fmt = new Intl.DateTimeFormat("fr-BE", {
    timeZone: BELGIUM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const yyyy = parts.find((p) => p.type === "year")?.value ?? "0000";
  const mm = parts.find((p) => p.type === "month")?.value ?? "00";
  const dd = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Vérifie qu'une string respecte le format YYYY-MM-DD strict.
 */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map((s) => parseInt(s, 10));
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // Vérifier que la date est réellement valide (pas 31 février)
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}
