"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, ListChecks, Lightbulb } from "lucide-react";

type ConceptSummary = {
  id: string;
  name: string;
  slug: string;
  program_id: string;
  uaa_id: string | null;
  description: string | null;
  questions_total: number;
  questions_active: number;
  theory_sections_filled: number;
  misconceptions_count: number;
};

type Tone = "ok" | "partial" | "empty";

function theoryStatus(filled: number): { label: string; tone: Tone } {
  if (filled === 0) return { label: "Théorie à classer", tone: "empty" };
  if (filled < 5) return { label: `${filled}/5 sections`, tone: "partial" };
  return { label: "Complète", tone: "ok" };
}

const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  empty: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

/**
 * Liste des concepts du prof (Sprint 2B PR B).
 *
 * Tab "Par concept" sur `/accueil/curation`. Lazy fetch via GET
 * `/api/curation/concepts` quand le component monte.
 *
 * A11y :
 * - `<ul role="list">` sémantique
 * - Cards = `<a>` cliquables → focus + clavier natif
 * - Status badges = texte + couleur (pas color-only)
 * - `aria-busy` pendant le fetch initial
 * - Empty state explicite
 */
export default function ConceptsList() {
  const [concepts, setConcepts] = useState<ConceptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchConcepts() {
      try {
        const res = await fetch("/api/curation/concepts");
        const json = (await res.json()) as {
          ok?: boolean;
          concepts?: ConceptSummary[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Erreur lors du chargement");
          return;
        }
        setConcepts(json.concepts ?? []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur réseau");
      }
    }
    void fetchConcepts();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div
        role="alert"
        className="
          rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900
          dark:border-red-900 dark:bg-red-950/40 dark:text-red-200
        "
      >
        <p className="font-semibold">Impossible de charger les concepts.</p>
        <p className="mt-1 text-xs">{error}</p>
      </div>
    );
  }

  if (concepts === null) {
    return (
      <div
        aria-busy="true"
        className="
          rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500
          dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400
        "
      >
        Chargement des concepts…
      </div>
    );
  }

  if (concepts.length === 0) {
    return (
      <div
        className="
          rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center
          dark:border-slate-700 dark:bg-slate-900
        "
      >
        <BookOpen
          size={28}
          strokeWidth={1.5}
          aria-hidden="true"
          className="mx-auto text-slate-400 dark:text-slate-500"
        />
        <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
          Aucun concept enregistré pour l&apos;instant.
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Les concepts sont générés automatiquement lors de l&apos;import d&apos;un PDF, ou créés via
          le pipeline d&apos;ingestion.
        </p>
        <Link
          href="/accueil/import"
          className="
            mt-4 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold
            text-indigo-700 transition hover:text-indigo-900
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-indigo-500 focus-visible:ring-offset-2
            focus-visible:ring-offset-white
            dark:text-indigo-400 dark:hover:text-indigo-300
            dark:focus-visible:ring-offset-slate-900
            motion-reduce:transition-none
          "
        >
          Importer un PDF
          <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <ul role="list" className="grid gap-3">
      {concepts.map((c) => {
        const theory = theoryStatus(c.theory_sections_filled);
        return (
          <li key={c.id}>
            <Link
              href={`/accueil/curation/concept/${c.id}`}
              className="
                group block rounded-2xl border border-slate-200 bg-white p-5
                transition hover:border-indigo-500 hover:shadow-md
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-indigo-500 focus-visible:ring-offset-2
                focus-visible:ring-offset-slate-50
                dark:border-slate-800 dark:bg-slate-900
                dark:hover:border-indigo-400
                dark:focus-visible:ring-offset-slate-950
                motion-reduce:transition-none
              "
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {c.name}
                  </h3>
                  {c.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                      {c.description}
                    </p>
                  ) : null}
                </div>
                <ChevronRight
                  size={16}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="
                    shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5
                    dark:text-slate-500
                    motion-reduce:transition-none
                  "
                />
              </div>

              <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <BookOpen
                    size={13}
                    strokeWidth={2}
                    aria-hidden="true"
                    className="text-slate-500 dark:text-slate-400"
                  />
                  <dt className="sr-only">Théorie</dt>
                  <dd>
                    <span className={`rounded px-1.5 py-0.5 font-medium ${TONE_CLASSES[theory.tone]}`}>
                      {theory.label}
                    </span>
                  </dd>
                </div>

                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <ListChecks size={13} strokeWidth={2} aria-hidden="true" />
                  <dt className="sr-only">Questions</dt>
                  <dd>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {c.questions_active}
                    </span>{" "}
                    active{c.questions_active > 1 ? "s" : ""} / {c.questions_total}
                  </dd>
                </div>

                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <Lightbulb size={13} strokeWidth={2} aria-hidden="true" />
                  <dt className="sr-only">Misconceptions</dt>
                  <dd>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {c.misconceptions_count}
                    </span>{" "}
                    misconception{c.misconceptions_count > 1 ? "s" : ""}
                  </dd>
                </div>
              </dl>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
