"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { masteryCellClass, masteryLabel, masteryLevel } from "@/lib/heatmap-mastery";

/**
 * Sprint 6 PR S6-12 — Composant client stats direction.
 *
 * UX (mémoire `feedback_heatmap_no_overwhelm` : max 3-5 alertes simultanées) :
 * - Hero KPI : 3 chiffres globaux (élèves, devoirs, complétions)
 * - Tableau classes : effectif, score moyen, mastery, participation, drill-down
 * - Top 5 concepts faibles cross-classes (alerte amber, < 50% mastery)
 *
 * A11y :
 * - <table> sémantique avec <caption>, <thead>, <th scope>
 * - aria-label sur les badges mastery
 * - focus-visible AA, motion-reduce
 */

type ClassStats = {
  class_id: string;
  name: string;
  level: number | null;
  subject: string | null;
  student_count: number;
  assignments_count: number;
  completions_done: number;
  avg_score: number | null;
  avg_mastery_pct: number | null;
  participation_pct: number;
};

type WeakConcept = {
  concept_id: string;
  name: string;
  mastery_pct: number;
  total_answers: number;
};

type ApiResponse = {
  ok: true;
  classes: ClassStats[];
  topWeakConcepts: WeakConcept[];
  totals: { students: number; assignments: number; completions: number };
};

export default function StatsDirectionClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/teacher/stats-direction");
        const json = (await res.json()) as ApiResponse | { ok: false; error: string };
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
  }, []);

  if (error) {
    return (
      <section
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      >
        <p className="font-semibold">Impossible de charger les stats.</p>
        <p className="mt-1 text-xs">{error}</p>
      </section>
    );
  }

  if (data === null) {
    return (
      <section
        aria-busy="true"
        className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center gap-3">
          <Loader2
            size={18}
            strokeWidth={2}
            aria-hidden="true"
            className="animate-spin text-indigo-500 motion-reduce:animate-none"
          />
          <p className="text-sm text-slate-700 dark:text-slate-300">Chargement…</p>
        </div>
      </section>
    );
  }

  if (data.classes.length === 0) {
    return (
      <section
        role="status"
        className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"
      >
        <Users size={28} strokeWidth={1.5} aria-hidden="true" className="mx-auto text-slate-400" />
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Tu n&apos;as pas encore créé de classe.
        </p>
        <Link
          href="/accueil/classes/nouvelle"
          className="
            mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2
            text-sm font-semibold text-white transition hover:bg-indigo-700
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-white
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          Créer une classe
        </Link>
      </section>
    );
  }

  return (
    <>
      {/* Hero KPI */}
      <section
        aria-labelledby="totals-title"
        className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <h2 id="totals-title" className="sr-only">
          Totaux globaux
        </h2>
        <KpiCard
          icon={<Users size={18} strokeWidth={2} aria-hidden="true" />}
          label="Élèves au total"
          value={data.totals.students.toString()}
        />
        <KpiCard
          icon={<CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" />}
          label="Devoirs assignés"
          value={data.totals.assignments.toString()}
        />
        <KpiCard
          icon={<TrendingUp size={18} strokeWidth={2} aria-hidden="true" />}
          label="Devoirs terminés"
          value={data.totals.completions.toString()}
        />
      </section>

      {/* Top concepts faibles */}
      {data.topWeakConcepts.length > 0 ? (
        <section
          aria-labelledby="weak-concepts-title"
          className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30"
        >
          <h2
            id="weak-concepts-title"
            className="mb-3 flex items-center gap-2 text-base font-semibold text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle size={18} strokeWidth={2} aria-hidden="true" />
            Concepts à retravailler en priorité
          </h2>
          <p className="mb-3 text-sm text-amber-800 dark:text-amber-300">
            Mastery moyen &lt; 50% sur l&apos;ensemble de tes classes. À traiter
            en remédiation collective.
          </p>
          <ul role="list" className="space-y-2">
            {data.topWeakConcepts.map((c) => (
              <li
                key={c.concept_id}
                className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 dark:bg-slate-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {c.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500">
                    {c.total_answers} réponses analysées
                  </p>
                </div>
                <span
                  aria-label={`Maîtrise ${c.mastery_pct}% — ${masteryLabel(masteryLevel(c.mastery_pct))}`}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${masteryCellClass(masteryLevel(c.mastery_pct))}`}
                >
                  {c.mastery_pct}%
                </span>
                <TrendingDown
                  size={16}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="shrink-0 text-amber-700 dark:text-amber-400"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Tableau classes */}
      <section
        aria-labelledby="classes-table-title"
        className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="px-5 py-4">
          <h2
            id="classes-table-title"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            Détail par classe
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Stats agrégées par classe : effectif, devoirs, score moyen,
              maîtrise moyenne, taux de participation
            </caption>
            <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-2 text-left">
                  Classe
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Élèves
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Devoirs
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Score moyen
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Maîtrise
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Participation
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.classes.map((c) => (
                <tr
                  key={c.class_id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <th
                    scope="row"
                    className="px-4 py-3 text-left font-medium text-slate-900 dark:text-slate-100"
                  >
                    <div className="min-w-0">
                      <p className="truncate">{c.name}</p>
                      {(c.subject || c.level !== null) && (
                        <p className="mt-0.5 text-xs font-normal text-slate-500 dark:text-slate-500">
                          {[c.subject, c.level ? `Niveau ${c.level}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                  </th>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {c.student_count}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {c.assignments_count}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {c.avg_score === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {c.avg_score}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {c.avg_mastery_pct === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span
                        aria-label={`Maîtrise ${c.avg_mastery_pct}%`}
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${masteryCellClass(masteryLevel(c.avg_mastery_pct))}`}
                      >
                        {c.avg_mastery_pct}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {c.participation_pct}%
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/accueil/classes/${c.class_id}`}
                      aria-label={`Détail classe ${c.name}`}
                      className="
                        inline-flex items-center gap-1 rounded text-xs font-medium
                        text-indigo-700 hover:text-indigo-900 transition
                        focus-visible:outline-none focus-visible:ring-2
                        focus-visible:ring-indigo-500 focus-visible:ring-offset-1
                        dark:text-indigo-400 dark:hover:text-indigo-200
                        motion-reduce:transition-none
                      "
                    >
                      Détail
                      <ExternalLink size={12} strokeWidth={2} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
    </div>
  );
}
