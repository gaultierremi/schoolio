import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import HeatmapProfVisxMockup from "./HeatmapProfVisxMockup";

export const dynamic = "force-dynamic";

/**
 * POC VISX — heatmap classe prof (Sprint 2.5 / pre-Sprint 3).
 *
 * Objectif : évaluer si VISX vaut le coup vs SVG inline pour les
 * visualisations Maïa (heatmap classe, charts dashboard, mastery trends).
 *
 * Dataset reproduit du mockup HTML statique
 * (docs/dashboard-prof-heatmap-mockup.html, exposé en preview sur /mockups).
 * Permet une comparaison côte-à-côte du rendu.
 *
 * Route gardée par le middleware /accueil ? Non — `/dev/*` n'est pas dans la
 * liste auth-required. Mais le contenu n'a pas de data sensible (mockup hardcodé).
 */
export default function VisxHeatmapProfPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-6xl bg-slate-50 px-6 py-8 dark:bg-slate-950">
      <Link
        href="/mockups"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        Mockups index
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            POC VISX — Heatmap classe
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Dataset chimie 4ème B (25 élèves × 8 concepts). Compare le rendu
            avec le{" "}
            <Link
              href="/mockups/dashboard-prof-heatmap-mockup.html"
              className="font-medium text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400"
              target="_blank"
              rel="noopener"
            >
              mockup HTML statique
            </Link>
            .
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          POC dev only
        </span>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <HeatmapProfVisxMockup />
      </section>

      <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Évaluation à faire
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Rendu visuel : aligné avec design-system MASTER ?</li>
          <li>Interactions (hover tooltip, click drill-down) : fluides ?</li>
          <li>Responsive : se redimensionne bien au resize fenêtre ?</li>
          <li>Dark mode : palette cohérente ?</li>
          <li>Code : volume vs SVG inline équivalent ?</li>
          <li>Bundle impact : +30kb gzipped (VISX modules), acceptable ?</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
          Décision après ce POC : adopter VISX comme stack de visualisations
          Maïa, ou rester SVG inline.
        </p>
      </section>
    </main>
  );
}
