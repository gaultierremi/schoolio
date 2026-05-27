"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  ListChecks,
  Lightbulb,
  Loader2,
  Sparkles,
} from "lucide-react";

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
type AutoLinkResult = {
  ok: true;
  stats: {
    questions_scanned: number;
    auto_applied: number;
    to_review: number;
    skipped_low_confidence: number;
    skipped_no_concepts: boolean;
  };
};

export default function ConceptsList() {
  const [concepts, setConcepts] = useState<ConceptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoLinkRunning, setAutoLinkRunning] = useState(false);
  const [autoLinkResult, setAutoLinkResult] = useState<AutoLinkResult["stats"] | null>(null);
  const [autoLinkError, setAutoLinkError] = useState<string | null>(null);

  const fetchConcepts = useCallback(async () => {
    try {
      const res = await fetch("/api/curation/concepts");
      const json = (await res.json()) as {
        ok?: boolean;
        concepts?: ConceptSummary[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Erreur lors du chargement");
        return;
      }
      setError(null);
      setConcepts(json.concepts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    }
  }, []);

  useEffect(() => {
    void fetchConcepts();
  }, [fetchConcepts]);

  async function handleAutoLink() {
    setAutoLinkRunning(true);
    setAutoLinkError(null);
    setAutoLinkResult(null);
    try {
      const res = await fetch("/api/curation/concepts/auto-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as
        | AutoLinkResult
        | { ok: false; error: string };
      if (!res.ok || !("ok" in json) || !json.ok) {
        setAutoLinkError(
          "error" in json ? json.error : "Erreur lors de l'auto-link",
        );
        return;
      }
      setAutoLinkResult(json.stats);
      // Refresh la liste pour mettre à jour les counts questions_active
      await fetchConcepts();
    } catch (err) {
      setAutoLinkError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setAutoLinkRunning(false);
    }
  }

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

  // Sprint 2B PR B — hierarchy fix : la page parent a h1 "Mes questions",
  // donc on rend les concepts en h2 (pas h3) pour ne pas skipper de niveau
  // (WCAG 1.3.1 Info and Relationships).
  return (
    <>
      {/* Auto-link banner : feedback Alex 2026-05-25 — "pourquoi ne pourrait-on
          pas remplir tout et lier tous les concepts et questions" */}
      <section
        aria-labelledby="auto-link-title"
        className="
          mb-6 rounded-2xl border border-[rgb(var(--accent)/0.3)]
          bg-[rgb(var(--accent)/0.06)] p-5
        "
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2
              id="auto-link-title"
              className="serif inline-flex items-center gap-2 text-base font-semibold text-[rgb(var(--ink))]"
            >
              <Sparkles
                size={16}
                strokeWidth={2}
                aria-hidden="true"
                className="accent-text"
              />
              Lier les questions aux concepts
            </h2>
            <p className="mt-1 text-sm text-[rgb(var(--ink-2))]">
              Maïa propose automatiquement un concept pour chaque question sans
              lien. Application directe si confiance ≥ 85%, sinon ignoré
              (révision manuelle ensuite).
            </p>
          </div>
          <button
            type="button"
            onClick={handleAutoLink}
            disabled={autoLinkRunning}
            className="
              btn-primary inline-flex items-center gap-1.5 rounded-xl
              px-4 py-2 text-sm font-semibold
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-[rgb(var(--accent))] focus-visible:ring-offset-2
              focus-visible:ring-offset-[rgb(var(--surface))]
              disabled:cursor-not-allowed disabled:opacity-60
              motion-reduce:transition-none
            "
          >
            {autoLinkRunning ? (
              <>
                <Loader2
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
                Lien en cours…
              </>
            ) : (
              <>
                <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
                Lier automatiquement
              </>
            )}
          </button>
        </div>

        {autoLinkError ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {autoLinkError}
          </p>
        ) : null}

        {autoLinkResult ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-3 rounded-lg bg-[rgb(var(--surface))] p-3 text-xs text-[rgb(var(--ink-2))]"
          >
            {autoLinkResult.skipped_no_concepts ? (
              <p>
                Aucun concept disponible pour ce tenant — importe un PDF
                d&apos;abord pour générer les concepts du chapitre.
              </p>
            ) : autoLinkResult.questions_scanned === 0 ? (
              <p>
                Toutes les questions sont déjà liées à un concept. Rien à faire !
              </p>
            ) : (
              <p>
                <strong className="text-[rgb(var(--ink))]">
                  {autoLinkResult.auto_applied}
                </strong>{" "}
                question{autoLinkResult.auto_applied !== 1 ? "s" : ""} liée
                {autoLinkResult.auto_applied !== 1 ? "s" : ""} automatiquement
                sur {autoLinkResult.questions_scanned} scannée
                {autoLinkResult.questions_scanned !== 1 ? "s" : ""}.{" "}
                {autoLinkResult.to_review > 0
                  ? `${autoLinkResult.to_review} en attente de révision (confiance moyenne). `
                  : ""}
                {autoLinkResult.skipped_low_confidence > 0
                  ? `${autoLinkResult.skipped_low_confidence} ignorée${autoLinkResult.skipped_low_confidence !== 1 ? "s" : ""} (faible confiance).`
                  : ""}
              </p>
            )}
          </div>
        ) : null}
      </section>

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
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {c.name}
                  </h2>
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
    </>
  );
}
