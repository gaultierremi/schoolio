"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, Home, RotateCcw } from "lucide-react";

/**
 * Sprint 6 PR S6-2 — Page erreur 500 brandée Maïa.
 *
 * Next 14 error boundary : reset() permet de re-render le segment côté client
 * sans full reload (utile pour erreurs transient comme réseau flaky).
 *
 * Tone : factuel, pas alarmant. Mémoire `feedback_landing_tone_adult_kind`.
 * Anti-leak : on log côté console mais on n'affiche pas le stack trace
 * (qui peut contenir des paths internes ou schémas DB).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[error-boundary]", error.message, error.digest);
  }, [error]);

  return (
    <main
      className="
        mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center
        px-4 py-12 text-center
      "
      lang="fr-BE"
    >
      <div
        aria-hidden="true"
        className="
          mb-6 flex h-20 w-20 items-center justify-center rounded-2xl
          bg-red-100 text-red-700
          dark:bg-red-950/40 dark:text-red-300
        "
      >
        <AlertCircle size={36} strokeWidth={1.75} />
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-400">
        Erreur 500
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Quelque chose s&apos;est mal passé.
      </h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
        Maïa a rencontré un souci inattendu. Tu peux réessayer ou revenir à
        l&apos;accueil. Si le problème persiste, contacte-nous à{" "}
        <a
          href="mailto:support@maia.app"
          className="font-medium text-indigo-700 underline hover:no-underline dark:text-indigo-400"
        >
          support@maia.app
        </a>
        .
      </p>
      {error.digest ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
          Code de référence : <code>{error.digest}</code>
        </p>
      ) : null}
      <nav aria-label="Actions" className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="
            inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2
            text-sm font-semibold text-white transition
            hover:bg-indigo-700
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-white
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
          Réessayer
        </button>
        <Link
          href="/accueil"
          className="
            inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white
            px-4 py-2 text-sm font-medium text-slate-700 transition
            hover:bg-slate-50
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-white
            dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          <Home size={14} strokeWidth={2} aria-hidden="true" />
          Retour à l&apos;accueil
        </Link>
      </nav>
    </main>
  );
}
