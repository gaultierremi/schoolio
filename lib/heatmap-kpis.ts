/**
 * Helpers KPI heatmap (Sprint design 2026-05-25 PR audit-design-3).
 *
 * Fonctions pures pour calculer les 4 KPI cards top du mockup
 * `docs/dashboard-prof-heatmap-mockup.html` lignes 152-175 :
 * - Participation (nb completed / total students)
 * - Moyenne classe (average de classAverage[])
 * - Concept le + faible (déjà calculé via findWeakestConcept)
 * - Concept le + fort (déjà calculé via findStrongestConcept)
 *
 * Lib séparée pour pouvoir tester sans toucher le DOM.
 */

import type { StatusKind } from "@/lib/heatmap-mastery";

export type ParticipationKpi = {
  completed: number;
  total: number;
  pct: number;
};

export function computeParticipation(students: { status: StatusKind }[]): ParticipationKpi {
  const total = students.length;
  const completed = students.filter((s) => s.status === "completed").length;
  const pct = total === 0 ? 0 : Math.round((100 * completed) / total);
  return { completed, total, pct };
}

export function computeClassAverage(classAverage: number[]): number {
  if (classAverage.length === 0) return 0;
  const nonZero = classAverage.filter((v) => v > 0);
  if (nonZero.length === 0) return 0;
  const sum = nonZero.reduce((acc, v) => acc + v, 0);
  return Math.round(sum / nonZero.length);
}
