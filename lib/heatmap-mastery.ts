/**
 * Sprint 3 PR S3-1 — Helpers heatmap mastery (logique pure, testable).
 *
 * Color scale + ordering + class average aligned avec mockup
 * `docs/dashboard-prof-heatmap-mockup.html`.
 */

export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Convertit un pourcentage de maîtrise (0-100) en niveau 0-5 selon les seuils
 * du mockup : 0 = non évalué, 1 < 40, 2 < 55, 3 < 70, 4 < 85, 5 >= 85.
 */
export function masteryLevel(pct: number): MasteryLevel {
  if (pct === 0) return 0;
  if (pct < 40) return 1;
  if (pct < 55) return 2;
  if (pct < 70) return 3;
  if (pct < 85) return 4;
  return 5;
}

/**
 * Label texte pour un niveau de maîtrise (a11y, screen reader).
 */
export function masteryLabel(level: MasteryLevel): string {
  switch (level) {
    case 0:
      return "non évalué";
    case 1:
      return "très faible (< 40%)";
    case 2:
      return "faible (40-54%)";
    case 3:
      return "moyen (55-69%)";
    case 4:
      return "bon (70-84%)";
    case 5:
      return "fort (85-100%)";
  }
}

/**
 * Classe Tailwind pour la cellule heatmap selon le niveau.
 * Aligné mockup : rouge → vert via orange/jaune intermédiaires.
 */
export function masteryCellClass(level: MasteryLevel): string {
  switch (level) {
    case 0:
      return "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400";
    case 1:
      return "bg-red-500 text-white dark:bg-red-600";
    case 2:
      return "bg-orange-400 text-slate-900 dark:bg-orange-500 dark:text-white";
    case 3:
      return "bg-yellow-400 text-slate-900 dark:bg-yellow-500 dark:text-slate-900";
    case 4:
      return "bg-lime-400 text-slate-900 dark:bg-lime-500 dark:text-slate-900";
    case 5:
      return "bg-emerald-500 text-white dark:bg-emerald-600";
  }
}

export type StatusKind = "completed" | "in_progress" | "not_started";

export function statusLabel(status: StatusKind): { label: string; toneClass: string } {
  switch (status) {
    case "completed":
      return { label: "Terminé", toneClass: "text-emerald-600 dark:text-emerald-400" };
    case "in_progress":
      return { label: "En cours", toneClass: "text-yellow-600 dark:text-yellow-400" };
    case "not_started":
      return { label: "Non commencé", toneClass: "text-slate-500 dark:text-slate-500" };
  }
}

/**
 * Tri par difficulté (mockup) : élèves avec moyenne mastery la plus basse
 * en premier (besoins prioritaires de remédiation). Les "not_started" sont
 * épinglés en bas (pas de mastery à mesurer).
 *
 * Moyenne ignore les concepts non évalués (mastery = 0).
 */
export function sortStudentsByDifficulty<
  T extends { masteries: number[]; status: StatusKind },
>(students: T[]): T[] {
  return students.slice().sort((a, b) => {
    if (a.status === "not_started" && b.status !== "not_started") return 1;
    if (b.status === "not_started" && a.status !== "not_started") return -1;
    const avgA = nonZeroAverage(a.masteries);
    const avgB = nonZeroAverage(b.masteries);
    return avgA - avgB;
  });
}

function nonZeroAverage(values: number[]): number {
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length === 0) return 0;
  return nonZero.reduce((s, v) => s + v, 0) / nonZero.length;
}

export type SortMode = "difficulty" | "alphabetical" | "score";

/**
 * Tri par alphabétique ou par score (moyenne décroissante) ou par difficulté.
 */
export function sortStudents<
  T extends { display_name: string; masteries: number[]; status: StatusKind },
>(students: T[], mode: SortMode): T[] {
  if (mode === "alphabetical") {
    return students.slice().sort((a, b) => a.display_name.localeCompare(b.display_name));
  }
  if (mode === "score") {
    return students.slice().sort((a, b) => nonZeroAverage(b.masteries) - nonZeroAverage(a.masteries));
  }
  return sortStudentsByDifficulty(students);
}

/**
 * Identifie le concept le plus faible / le plus fort selon classAverage.
 * Retourne null si tous les concepts sont à 0 (non évalués).
 */
export function findWeakestConcept<T extends { name: string }>(
  concepts: T[],
  classAverage: number[],
): { concept: T; pct: number } | null {
  let minIdx = -1;
  let minVal = 101;
  for (let i = 0; i < classAverage.length; i++) {
    if (classAverage[i] > 0 && classAverage[i] < minVal) {
      minVal = classAverage[i];
      minIdx = i;
    }
  }
  if (minIdx === -1) return null;
  return { concept: concepts[minIdx], pct: minVal };
}

export function findStrongestConcept<T extends { name: string }>(
  concepts: T[],
  classAverage: number[],
): { concept: T; pct: number } | null {
  let maxIdx = -1;
  let maxVal = -1;
  for (let i = 0; i < classAverage.length; i++) {
    if (classAverage[i] > maxVal) {
      maxVal = classAverage[i];
      maxIdx = i;
    }
  }
  if (maxIdx === -1 || maxVal === 0) return null;
  return { concept: concepts[maxIdx], pct: maxVal };
}

/**
 * Compte d'élèves "en difficulté" : status != 'not_started' ET avg < 50%.
 * Sert au header "X élèves nécessitent un suivi prioritaire".
 */
export function countStrugglingStudents<
  T extends { masteries: number[]; status: StatusKind },
>(students: T[]): number {
  return students.filter((s) => {
    if (s.status === "not_started") return false;
    const avg = nonZeroAverage(s.masteries);
    return avg > 0 && avg < 50;
  }).length;
}
