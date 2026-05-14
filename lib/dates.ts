/**
 * Year academic FWB : démarre le 1er août.
 *
 * Une classe créée entre 1er août YYYY et 31 juillet YYYY+1 appartient à
 * l'année académique "YYYY/YYYY+1".
 *
 * Exemples :
 *   - 2026-05-14 → "2025/2026"  (mai → on est dans l'année académique
 *                                 démarrée en août 2025)
 *   - 2026-08-01 → "2026/2027"  (1er août → bascule)
 *   - 2026-12-31 → "2026/2027"
 *   - 2027-07-31 → "2026/2027"  (juillet → toujours l'année qui démarra en
 *                                 août 2026)
 *
 * Utilise getMonth() / getFullYear() côté server (Vercel = UTC). L'offset
 * UTC ↔ Brussels (1-2h) est négligeable pour le cas pédagogique : une
 * classe créée à 23h00 UTC le 31 juillet en Belgique sera tagguée 2026/2027,
 * pas 2025/2026 — acceptable pour une frontière administrative.
 */
export function currentAcademicYear(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  // Août = index 7. À partir de cet index, on bascule à l'année académique suivante.
  if (month >= 7) {
    return `${year}/${year + 1}`;
  }
  return `${year - 1}/${year}`;
}

/**
 * Pattern validateur pour l'année académique. À utiliser dans les routes
 * API qui acceptent academic_year en entrée (ex: import historique).
 */
export const ACADEMIC_YEAR_RE = /^\d{4}\/\d{4}$/;
