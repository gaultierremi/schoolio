"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Quote } from "lucide-react";

/**
 * Badge `source_quote` read-only (Sprint 2B PR B).
 *
 * Mémoire `project_curation_concept_view` : "source quote read-only post-ingestion
 * (intangible pour préserver la traçabilité)". Le prof ne peut JAMAIS éditer la
 * provenance — il édite seulement la réinterprétation autour.
 *
 * UX :
 * - Badge compact par défaut avec icône Quote + chevron
 * - Click → expand pour montrer le quote + source_concept_path
 *
 * A11y :
 * - `aria-expanded` sur le bouton
 * - `aria-controls` pointe vers le panel
 * - Espace/Enter pour toggle (button natif)
 */
export default function SourceQuoteBadge({
  sourceQuote,
  sourceConceptPath,
}: {
  sourceQuote: string | null;
  sourceConceptPath: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  // Si pas de source du tout → rien à afficher (concept créé manuellement)
  if (!sourceQuote && !sourceConceptPath) return null;

  const panelId = "source-quote-panel";

  return (
    <div className="w-full sm:w-auto sm:max-w-md">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="
          inline-flex w-full items-center justify-between gap-2 rounded-lg
          border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600
          transition hover:bg-slate-50 hover:text-slate-900
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-indigo-500 focus-visible:ring-offset-2
          focus-visible:ring-offset-slate-50
          dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400
          dark:hover:bg-slate-800 dark:hover:text-slate-200
          dark:focus-visible:ring-offset-slate-950
          motion-reduce:transition-none
        "
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Quote size={12} strokeWidth={2} aria-hidden="true" />
          <span className="truncate">Source : {sourceConceptPath ?? "extrait PDF"}</span>
        </span>
        {expanded ? (
          <ChevronUp size={12} strokeWidth={2} aria-hidden="true" />
        ) : (
          <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
        )}
      </button>
      {expanded ? (
        <div
          id={panelId}
          className="
            mt-2 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700
            dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300
          "
        >
          {sourceQuote ? (
            <p className="italic">« {sourceQuote} »</p>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">
              Pas de citation directe — source : {sourceConceptPath}
            </p>
          )}
          <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Lecture seule · Non modifiable
          </p>
        </div>
      ) : null}
    </div>
  );
}
