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

/**
 * Fin de la fenêtre d'accès aux données d'une classe = 31 décembre 23:59:59
 * de l'année calendaire qui suit le début de l'année académique.
 *
 * Exemples :
 *   - "2025/2026" → accessible jusqu'au 31 décembre 2026 23:59:59
 *   - "2026/2027" → accessible jusqu'au 31 décembre 2027 23:59:59
 *
 * Pourquoi cette fenêtre étendue après la fin "officielle" de l'année (juin) :
 *   - Examens de repassage en août → besoin d'accès au contenu pour préparer
 *   - Programmes de révision estivaux pré-repassage
 *   - Buffer septembre-décembre pour transition pédagogique
 *
 * Après cette date, la classe passe en "archive" : pas effacée (Rule 23
 * never-DELETE), mais cachée des dashboards par défaut, accessible uniquement
 * via vue stats direction (future feature).
 */
export function classAccessCutoff(academicYear: string): Date | null {
  const match = academicYear.match(/^(\d{4})\/(\d{4})$/);
  if (!match) return null;
  const endYear = parseInt(match[2], 10);
  return new Date(endYear, 11, 31, 23, 59, 59);
}

/**
 * Returns true si la classe d'une academic_year donnée est encore dans sa
 * fenêtre d'accès (par défaut = R/W côté prof, lecture pour élève en révision).
 */
export function isClassAccessible(academicYear: string, now: Date = new Date()): boolean {
  const cutoff = classAccessCutoff(academicYear);
  if (!cutoff) return false;
  return now.getTime() <= cutoff.getTime();
}

/**
 * Liste les academic_years actuellement accessibles : l'année courante +
 * l'année précédente si on est encore dans sa fenêtre d'accès (jusqu'au
 * 31/12). Utile pour filtrer le dashboard prof/élève.
 */
export function accessibleAcademicYears(now: Date = new Date()): string[] {
  const current = currentAcademicYear(now);
  const result = [current];
  // Année précédente = decrement chaque YYYY
  const match = current.match(/^(\d{4})\/(\d{4})$/);
  if (match) {
    const prev = `${parseInt(match[1], 10) - 1}/${parseInt(match[2], 10) - 1}`;
    if (isClassAccessible(prev, now)) {
      result.push(prev);
    }
  }
  return result;
}
