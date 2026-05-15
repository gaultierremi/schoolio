"use client";

import { useState, useMemo } from "react";
import { Group } from "@visx/group";
import { scaleLinear, scaleBand } from "@visx/scale";
import { ParentSize } from "@visx/responsive";
import { Text } from "@visx/text";

/**
 * POC heatmap classe prof via VISX (Sprint 2.5).
 *
 * Architecture :
 * - Pas HeatmapRect (nested binning peu pratique pour students/concepts) →
 *   on construit avec scaleBand + rectangles SVG natifs. VISX nous donne le
 *   responsive container, les scales, et la cohérence (vs D3 raw).
 * - Color scale diverging : rose (low) → amber (mid) → emerald (high) per
 *   design-system MASTER §Couleurs heatmap.
 * - Tooltip hover : composant CSS positionné absolument (plus simple que
 *   @visx/tooltip Portal pour ce POC).
 * - Cellule "non évalué" (mastery=0 + statut not_started) : rendu spécial gris
 *   pour ne pas alarmer faussement.
 *
 * Status d'élève : 'done', 'in_progress', 'not_started'.
 */

type Status = "done" | "in_progress" | "not_started";
type StudentRow = {
  firstName: string;
  lastName: string;
  status: Status;
  masteries: number[]; // longueur = CONCEPTS.length
};

const CONCEPTS = [
  { key: "atomes", label: "Atomes" },
  { key: "tableau", label: "Tableau périodique" },
  { key: "liaisons", label: "Liaisons" },
  { key: "nomenclature", label: "Nomenclature" },
  { key: "equations", label: "Équations" },
  { key: "stoechiometrie", label: "Stœchio" },
  { key: "solutions", label: "Solutions" },
  { key: "acides", label: "Acides" },
];

const STUDENTS: StudentRow[] = [
  { firstName: "Adèle", lastName: "Lefèvre", status: "done", masteries: [88, 92, 84, 78, 82, 72, 68, 75] },
  { firstName: "Bastien", lastName: "Toussaint", status: "done", masteries: [82, 90, 76, 68, 72, 55, 52, 68] },
  { firstName: "Camille", lastName: "Petit", status: "done", masteries: [85, 88, 80, 72, 76, 62, 58, 70] },
  { firstName: "Daphné", lastName: "Mertens", status: "done", masteries: [80, 85, 70, 68, 62, 42, 45, 58] },
  { firstName: "Emrick", lastName: "Lambert", status: "done", masteries: [75, 82, 68, 62, 58, 38, 42, 52] },
  { firstName: "Florine", lastName: "Vermeulen", status: "done", masteries: [78, 85, 72, 65, 60, 40, 48, 55] },
  { firstName: "Gaspard", lastName: "De Baere", status: "done", masteries: [90, 95, 88, 82, 78, 65, 72, 80] },
  { firstName: "Hugo", lastName: "Lemmens", status: "done", masteries: [72, 78, 65, 58, 52, 32, 38, 48] },
  { firstName: "Inès", lastName: "Charlier", status: "done", masteries: [88, 92, 82, 78, 72, 58, 62, 70] },
  { firstName: "Justine", lastName: "Dewaele", status: "done", masteries: [80, 88, 75, 68, 65, 48, 52, 62] },
  { firstName: "Kylian", lastName: "Dupuis", status: "done", masteries: [60, 72, 55, 48, 38, 22, 28, 42] },
  { firstName: "Lou", lastName: "Beaumont", status: "not_started", masteries: [0, 0, 0, 0, 0, 0, 0, 0] },
  { firstName: "Mathéo", lastName: "Vandenbroucke", status: "done", masteries: [55, 68, 42, 38, 32, 18, 22, 35] },
  { firstName: "Nora", lastName: "Geerts", status: "done", masteries: [82, 88, 78, 70, 68, 52, 55, 65] },
  { firstName: "Ophélie", lastName: "Renard", status: "done", masteries: [85, 90, 82, 75, 72, 62, 65, 72] },
  { firstName: "Paul", lastName: "Janssens", status: "done", masteries: [78, 85, 72, 65, 62, 48, 50, 60] },
  { firstName: "Quentin", lastName: "Goffinet", status: "in_progress", masteries: [70, 80, 65, 55, 0, 0, 0, 0] },
  { firstName: "Roxane", lastName: "Verbeke", status: "done", masteries: [85, 90, 80, 75, 70, 55, 60, 68] },
  { firstName: "Sacha", lastName: "Boulanger", status: "done", masteries: [72, 78, 65, 58, 55, 38, 42, 52] },
  { firstName: "Tom", lastName: "Wauters", status: "done", masteries: [80, 85, 72, 68, 62, 45, 48, 58] },
  { firstName: "Ursula", lastName: "Engelen", status: "done", masteries: [88, 92, 82, 78, 75, 62, 68, 72] },
  { firstName: "Victor", lastName: "Hennequin", status: "in_progress", masteries: [75, 82, 0, 0, 0, 0, 0, 0] },
  { firstName: "Wilhelm", lastName: "Smets", status: "done", masteries: [78, 85, 72, 65, 58, 40, 45, 55] },
  { firstName: "Yann", lastName: "Maes", status: "not_started", masteries: [0, 0, 0, 0, 0, 0, 0, 0] },
  { firstName: "Zoé", lastName: "Delvaux", status: "done", masteries: [92, 95, 88, 85, 82, 72, 78, 82] },
];

// Color scale diverging — design-system/MASTER.md §Heatmap diverging.
// Pour les cellules non évaluées (mastery=0 + not_started), on utilise un gris neutre.
function masteryColor(mastery: number, evaluated: boolean): string {
  if (!evaluated) return "rgb(226 232 240)"; // slate-200
  if (mastery >= 75) return "rgb(16 185 129)"; // emerald-500
  if (mastery >= 60) return "rgb(132 204 22)"; // lime-500
  if (mastery >= 45) return "rgb(250 204 21)"; // yellow-400
  if (mastery >= 30) return "rgb(251 146 60)"; // orange-400
  return "rgb(244 63 94)"; // rose-500
}

function statusLabel(status: Status): { label: string; color: string } {
  switch (status) {
    case "done":
      return { label: "Terminé", color: "rgb(16 185 129)" };
    case "in_progress":
      return { label: "En cours", color: "rgb(250 204 21)" };
    case "not_started":
      return { label: "Non commencé", color: "rgb(148 163 184)" };
  }
}

export default function HeatmapProfVisxMockup() {
  const [hoveredCell, setHoveredCell] = useState<{ student: StudentRow; conceptIdx: number; x: number; y: number } | null>(null);

  // Stats globales pour la légende
  const stats = useMemo(() => {
    const allValues = STUDENTS.flatMap((s) =>
      s.status === "not_started" ? [] : s.masteries.filter((m, i) => !(s.status === "in_progress" && i >= 4 && m === 0)),
    );
    const avg = allValues.length === 0 ? 0 : Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length);
    const lacunes = STUDENTS.filter((s) => s.masteries.some((m) => m > 0 && m < 45)).length;
    const completed = STUDENTS.filter((s) => s.status === "done").length;
    return { avg, lacunes, completed, total: STUDENTS.length };
  }, []);

  return (
    <div>
      {/* KPI bar — équivalent de la 4-cards row du mockup HTML */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Élèves" value={`${stats.completed}/${stats.total}`} subtitle="terminés" />
        <KpiCard label="Moyenne" value={`${stats.avg}%`} subtitle="maîtrise classe" />
        <KpiCard label="Lacunes" value={String(stats.lacunes)} subtitle="élèves en alerte" highlight />
        <KpiCard label="Concepts" value={`${CONCEPTS.length}`} subtitle="couverts" />
      </div>

      <div className="relative">
        <ParentSize>
          {({ width }) => {
            if (width === 0) return null;

            // Layout : student names colonne gauche (largeur 180px) + body cellules
            const labelColWidth = 180;
            const statusColWidth = 110;
            const conceptHeaderHeight = 70;
            const rowHeight = 28;
            const cellWidth = Math.max(40, (width - labelColWidth - statusColWidth - 8) / CONCEPTS.length);
            const bodyWidth = cellWidth * CONCEPTS.length;
            const totalHeight = conceptHeaderHeight + STUDENTS.length * rowHeight;

            const xScale = scaleBand<number>({
              domain: CONCEPTS.map((_, i) => i),
              range: [0, bodyWidth],
              padding: 0.05,
            });
            const yScale = scaleBand<number>({
              domain: STUDENTS.map((_, i) => i),
              range: [0, STUDENTS.length * rowHeight],
              padding: 0.08,
            });

            return (
              <svg width={width} height={totalHeight} style={{ overflow: "visible" }}>
                {/* Concept column headers */}
                <Group left={labelColWidth} top={0}>
                  {CONCEPTS.map((c, i) => (
                    <Text
                      key={c.key}
                      x={(xScale(i) ?? 0) + cellWidth / 2}
                      y={conceptHeaderHeight - 12}
                      textAnchor="middle"
                      verticalAnchor="end"
                      fontSize={11}
                      fontWeight={600}
                      fill="rgb(71 85 105)" // slate-600
                      angle={-25}
                    >
                      {c.label}
                    </Text>
                  ))}
                </Group>

                {/* Body : rows = students */}
                <Group top={conceptHeaderHeight}>
                  {STUDENTS.map((student, sIdx) => {
                    const y = yScale(sIdx) ?? 0;
                    const status = statusLabel(student.status);
                    return (
                      <Group key={`${student.firstName}-${student.lastName}`} top={y}>
                        {/* Student label */}
                        <Text
                          x={labelColWidth - 10}
                          y={rowHeight / 2}
                          textAnchor="end"
                          verticalAnchor="middle"
                          fontSize={12}
                          fontWeight={500}
                          fill="rgb(30 41 59)" // slate-800
                        >
                          {`${student.firstName} ${student.lastName}`}
                        </Text>

                        {/* Mastery cells */}
                        <Group left={labelColWidth}>
                          {student.masteries.map((m, cIdx) => {
                            const evaluated = !(student.status === "not_started" || (student.status === "in_progress" && m === 0));
                            const cellX = xScale(cIdx) ?? 0;
                            const fill = masteryColor(m, evaluated);
                            return (
                              <g
                                key={cIdx}
                                onMouseEnter={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const containerRect = e.currentTarget
                                    .closest("[data-heatmap-container]")
                                    ?.getBoundingClientRect();
                                  setHoveredCell({
                                    student,
                                    conceptIdx: cIdx,
                                    x: rect.left - (containerRect?.left ?? 0) + rect.width / 2,
                                    y: rect.top - (containerRect?.top ?? 0),
                                  });
                                }}
                                onMouseLeave={() => setHoveredCell(null)}
                                style={{ cursor: "pointer" }}
                              >
                                <rect
                                  x={cellX}
                                  y={4}
                                  width={xScale.bandwidth()}
                                  height={rowHeight - 8}
                                  fill={fill}
                                  rx={4}
                                  ry={4}
                                  className="transition-opacity hover:opacity-80"
                                />
                                {evaluated && (
                                  <Text
                                    x={cellX + xScale.bandwidth() / 2}
                                    y={rowHeight / 2}
                                    textAnchor="middle"
                                    verticalAnchor="middle"
                                    fontSize={10}
                                    fontWeight={700}
                                    fill={m >= 60 ? "white" : "rgb(15 23 42)"}
                                    pointerEvents="none"
                                  >
                                    {m}
                                  </Text>
                                )}
                                {!evaluated && (
                                  <Text
                                    x={cellX + xScale.bandwidth() / 2}
                                    y={rowHeight / 2}
                                    textAnchor="middle"
                                    verticalAnchor="middle"
                                    fontSize={11}
                                    fill="rgb(148 163 184)"
                                    pointerEvents="none"
                                  >
                                    —
                                  </Text>
                                )}
                              </g>
                            );
                          })}
                        </Group>

                        {/* Status column */}
                        <Text
                          x={labelColWidth + bodyWidth + 8}
                          y={rowHeight / 2}
                          verticalAnchor="middle"
                          fontSize={11}
                          fontWeight={600}
                          fill={status.color}
                        >
                          {status.label}
                        </Text>
                      </Group>
                    );
                  })}
                </Group>
              </svg>
            );
          }}
        </ParentSize>

        {/* Conteneur pour positioning tooltip */}
        <div data-heatmap-container className="pointer-events-none absolute inset-0" />

        {/* Tooltip absolute positioned */}
        {hoveredCell && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
            style={{ left: hoveredCell.x, top: hoveredCell.y - 6 }}
          >
            <div className="font-semibold">
              {hoveredCell.student.firstName} {hoveredCell.student.lastName}
            </div>
            <div className="text-slate-300 dark:text-slate-600">
              {CONCEPTS[hoveredCell.conceptIdx].label}
            </div>
            <div className="mt-1">
              {hoveredCell.student.status === "not_started" ||
              (hoveredCell.student.status === "in_progress" && hoveredCell.student.masteries[hoveredCell.conceptIdx] === 0)
                ? "Non évalué"
                : `${hoveredCell.student.masteries[hoveredCell.conceptIdx]}% maîtrise`}
            </div>
          </div>
        )}
      </div>

      {/* Légende color scale */}
      <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
        <span className="font-medium">Échelle :</span>
        {[
          { range: "0-30", color: "rgb(244 63 94)" },
          { range: "30-45", color: "rgb(251 146 60)" },
          { range: "45-60", color: "rgb(250 204 21)" },
          { range: "60-75", color: "rgb(132 204 22)" },
          { range: "75-100", color: "rgb(16 185 129)" },
        ].map((s) => (
          <span key={s.range} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded" style={{ background: s.color }} />
            {s.range}%
          </span>
        ))}
        <span className="ml-2 inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-slate-200 dark:bg-slate-700" />
          Non évalué
        </span>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  highlight,
}: {
  label: string;
  value: string;
  subtitle: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/20"
          : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          highlight ? "text-rose-700 dark:text-rose-300" : "text-slate-900 dark:text-slate-100"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">{subtitle}</p>
    </div>
  );
}
