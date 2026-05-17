"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, ChevronDown, Lightbulb, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import {
  countStrugglingStudents,
  findStrongestConcept,
  findWeakestConcept,
  generateRemediationSuggestions,
  masteryCellClass,
  masteryLabel,
  masteryLevel,
  sortStudents,
  statusLabel,
  type SortMode,
  type StatusKind,
} from "@/lib/heatmap-mastery";

type ConceptRow = { id: string; name: string; slug: string };
type StudentRow = {
  user_id: string;
  display_name: string;
  status: StatusKind;
  masteries: number[];
};

type HeatmapData = {
  ok: true;
  concepts: ConceptRow[];
  students: StudentRow[];
  classAverage: number[];
};

/**
 * Heatmap concept × élève pour un devoir (Sprint 3 PR S3-1).
 *
 * Mockup source : `docs/dashboard-prof-heatmap-mockup.html`.
 *
 * UX :
 * - Header KPI : participation, moyenne, concept + faible / + fort
 * - Filtres : tri (difficulté / alphabétique / score)
 * - Table : ligne 1 = moyenne classe, puis 1 ligne / élève (trié)
 * - Cellules colorées (mastery 0-5 = gris/rouge/orange/jaune/lime/vert)
 * - Click cellule = drill-down (modal détail élève × concept) — TODO Sprint 3+
 * - Légende couleurs en bas
 *
 * A11y :
 * - `<table>` sémantique avec <caption> + <thead><tbody><tr><th scope>
 * - `aria-label` sur chaque cellule : élève + concept + mastery + niveau
 * - Texte + couleur (jamais color-only)
 * - `aria-busy` pendant fetch
 */
export default function ConceptHeatmap({
  classId,
  assignmentId,
}: {
  classId: string;
  assignmentId: string;
}) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("difficulty");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/classes/${classId}/assignments/${assignmentId}/heatmap-data`,
        );
        const json = (await res.json()) as
          | HeatmapData
          | { ok: false; error: string };
        if (cancelled) return;
        if (!res.ok || !("ok" in json) || !json.ok) {
          setError("error" in json ? json.error : "Erreur de chargement");
          return;
        }
        setData(json);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur réseau");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [classId, assignmentId]);

  const sortedStudents = useMemo(
    () => (data ? sortStudents(data.students, sortMode) : []),
    [data, sortMode],
  );

  const weakest = useMemo(
    () => (data ? findWeakestConcept(data.concepts, data.classAverage) : null),
    [data],
  );
  const strongest = useMemo(
    () => (data ? findStrongestConcept(data.concepts, data.classAverage) : null),
    [data],
  );
  const strugglingCount = useMemo(
    () => (data ? countStrugglingStudents(data.students) : 0),
    [data],
  );

  // Sprint 3 PR S3-2 : suggestions de remédiation déterministe (pas IA runtime)
  // Mémoire feedback_heatmap_no_overwhelm : max 5 alertes encourageant.
  const remediationSuggestions = useMemo(
    () =>
      data
        ? generateRemediationSuggestions(data.students, data.concepts, 5)
        : [],
    [data],
  );

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      >
        <p className="font-semibold">Impossible de charger la heatmap.</p>
        <p className="mt-1 text-xs">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        aria-busy="true"
        className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900"
      >
        <Loader2
          size={20}
          strokeWidth={2}
          aria-hidden="true"
          className="mx-auto animate-spin text-indigo-500 motion-reduce:animate-none"
        />
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Chargement de la heatmap…
        </p>
      </div>
    );
  }

  if (data.concepts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
        <BookOpen
          size={28}
          strokeWidth={1.5}
          aria-hidden="true"
          className="mx-auto text-slate-400 dark:text-slate-500"
        />
        <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
          Aucun concept taggé sur les questions de ce devoir.
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Les questions doivent être rattachées à un concept (champ <code>concept_id</code>) pour
          apparaître ici. Cf. vue concept unifiée &mdash;{" "}
          <code>/accueil/curation/concept/[id]</code>.
        </p>
      </div>
    );
  }

  if (data.students.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Cette classe n&apos;a aucun élève actif.
        </p>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="heatmap-title"
      className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      {/* ── Header ── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="heatmap-title"
            className="text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            Carte de maîtrise — {data.concepts.length} concept
            {data.concepts.length > 1 ? "s" : ""}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Survoler une cellule pour voir le détail élève × concept.
          </p>
        </div>

        {/* KPI mini */}
        <div className="flex flex-wrap gap-3 text-xs">
          {strugglingCount > 0 ? (
            <div className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
              <span>
                <strong>{strugglingCount}</strong> élève{strugglingCount > 1 ? "s" : ""} en
                difficulté
              </span>
            </div>
          ) : null}
          {weakest ? (
            <div className="inline-flex items-center gap-1.5 rounded-md bg-orange-50 px-2 py-1 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300">
              <TrendingDown size={12} strokeWidth={2} aria-hidden="true" />
              <span>
                + faible : <strong>{weakest.concept.name}</strong> ({weakest.pct}%)
              </span>
            </div>
          ) : null}
          {strongest ? (
            <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <TrendingUp size={12} strokeWidth={2} aria-hidden="true" />
              <span>
                + fort : <strong>{strongest.concept.name}</strong> ({strongest.pct}%)
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Tri + légende ── */}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <label
          htmlFor="heatmap-sort"
          className="font-medium text-slate-600 dark:text-slate-400"
        >
          Trier&nbsp;:
        </label>
        <div className="relative">
          <select
            id="heatmap-sort"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="appearance-none rounded-md border border-slate-300 bg-white pl-2 pr-7 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="difficulty">Élèves en difficulté en premier</option>
            <option value="alphabetical">Ordre alphabétique</option>
            <option value="score">Score décroissant</option>
          </select>
          <ChevronDown
            size={12}
            strokeWidth={2}
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
          />
        </div>

        <span aria-hidden="true" className="h-3 w-px bg-slate-300 dark:bg-slate-700" />

        <span className="text-slate-500 dark:text-slate-500">Légende&nbsp;:</span>
        {[0, 1, 2, 3, 4, 5].map((lvl) => (
          <span
            key={lvl}
            className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400"
          >
            <span
              aria-hidden="true"
              className={`inline-block h-3 w-3 rounded ${masteryCellClass(lvl as 0 | 1 | 2 | 3 | 4 | 5)}`}
            />
            {lvl === 0 && "non évalué"}
            {lvl === 1 && "< 40%"}
            {lvl === 2 && "40-54%"}
            {lvl === 3 && "55-69%"}
            {lvl === 4 && "70-84%"}
            {lvl === 5 && "≥ 85%"}
          </span>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          style={{ borderCollapse: "separate", borderSpacing: "4px" }}
        >
          <caption className="sr-only">
            Carte de maîtrise des concepts pour ce devoir. Lignes = élèves, colonnes = concepts,
            cellules = pourcentage de maîtrise (0 à 100) coloré selon le niveau.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-[180px] bg-white px-2 text-left text-xs font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400"
              >
                Élève
              </th>
              {data.concepts.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="text-center text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  {c.name}
                </th>
              ))}
            </tr>
            {/* Class average row */}
            <tr className="text-xs">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-white px-2 py-1 text-left italic text-slate-500 dark:bg-slate-900 dark:text-slate-400"
              >
                Moyenne classe
              </th>
              {data.classAverage.map((pct, i) => {
                const level = masteryLevel(pct);
                return (
                  <td key={i} className="px-1">
                    <div
                      aria-label={`Moyenne classe ${data.concepts[i].name} : ${pct === 0 ? "non évaluée" : pct + " pourcent — " + masteryLabel(level)}`}
                      className={`mx-auto flex h-7 w-12 items-center justify-center rounded-md text-xs font-semibold ${masteryCellClass(level)}`}
                    >
                      {pct === 0 ? "—" : pct}
                    </div>
                  </td>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedStudents.map((student) => {
              const { label: statusText, toneClass: statusTone } = statusLabel(student.status);
              const initials = student.display_name
                .split(/\s+/)
                .map((w) => w.charAt(0))
                .slice(0, 2)
                .join("")
                .toUpperCase();
              return (
                <tr
                  key={student.user_id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-normal dark:bg-slate-900"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                      >
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                          {student.display_name}
                        </p>
                        <p className={`text-[10px] ${statusTone}`}>{statusText}</p>
                      </div>
                    </div>
                  </th>
                  {student.masteries.map((pct, i) => {
                    const level = masteryLevel(pct);
                    return (
                      <td key={i} className="px-1">
                        <div
                          aria-label={`${student.display_name} — ${data.concepts[i].name} : ${pct === 0 ? "non évalué" : pct + " pourcent — " + masteryLabel(level)}`}
                          tabIndex={0}
                          className={`mx-auto flex h-7 w-12 items-center justify-center rounded-md text-xs font-semibold transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white hover:scale-105 dark:focus-visible:ring-offset-slate-900 motion-reduce:transition-none ${masteryCellClass(level)}`}
                        >
                          {pct === 0 ? "—" : pct}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Side panel Suggestions de remédiation (Sprint 3 PR S3-2) ──
          Déterministe, calculé client-side depuis data heatmap (pas IA runtime).
          Mémoire `project_drilldown_summary_maia` + `feedback_heatmap_no_overwhelm`. */}
      {remediationSuggestions.length > 0 ? (
        <aside
          aria-labelledby="remediation-title"
          className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 dark:border-indigo-900 dark:bg-indigo-950/30"
        >
          <div className="flex items-start gap-2">
            <Lightbulb
              size={18}
              strokeWidth={2}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400"
            />
            <div className="min-w-0 flex-1">
              <h4
                id="remediation-title"
                className="text-sm font-semibold text-indigo-900 dark:text-indigo-100"
              >
                Suggestions de remédiation
              </h4>
              <p className="mt-0.5 text-xs text-indigo-800 dark:text-indigo-300">
                {remediationSuggestions.length} élève
                {remediationSuggestions.length > 1 ? "s" : ""} nécessite
                {remediationSuggestions.length > 1 ? "nt" : ""} un suivi prioritaire
              </p>
            </div>
          </div>

          <ul role="list" className="mt-3 space-y-2">
            {remediationSuggestions.map((s) => {
              const iconClass =
                s.severity === "high"
                  ? "text-red-500 dark:text-red-400"
                  : s.severity === "medium"
                    ? "text-orange-500 dark:text-orange-400"
                    : "text-slate-500 dark:text-slate-400";
              return (
                <li
                  key={s.studentUserId}
                  className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 dark:bg-slate-900"
                >
                  <AlertTriangle
                    size={14}
                    strokeWidth={2}
                    aria-hidden="true"
                    className={`mt-0.5 shrink-0 ${iconClass}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {s.studentDisplayName}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {s.reason}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-[10px] italic text-indigo-700 dark:text-indigo-400">
            Calculé automatiquement depuis les résultats du devoir · pas d&apos;IA
            temps réel
          </p>
        </aside>
      ) : null}
    </section>
  );
}
