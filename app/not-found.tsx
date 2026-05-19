import Link from "next/link";
import { Compass, Home } from "lucide-react";

/**
 * Sprint 6 PR S6-2 — Page 404 brandée Maïa.
 *
 * Triggered par Next 14 quand :
 *   - notFound() est appelé depuis un Server Component
 *   - Aucun fichier ne matche l'URL
 *
 * Tone : adulte bienveillant (mémoire `feedback_landing_tone_adult_kind`),
 * pas infantilisant. Pas d'emoji "oups" pleurnichard.
 */
export const metadata = {
  title: "Page introuvable · Maïa",
};

export default function NotFound() {
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
          bg-indigo-100 text-indigo-700
          dark:bg-indigo-950/40 dark:text-indigo-300
        "
      >
        <Compass size={36} strokeWidth={1.75} />
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
        Erreur 404
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Cette page n&apos;existe pas.
      </h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
        Le lien est peut-être obsolète ou mal copié. Tu peux retourner à
        l&apos;accueil pour repartir d&apos;un bon pied.
      </p>
      <nav aria-label="Navigation de secours" className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/accueil"
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
          <Home size={14} strokeWidth={2} aria-hidden="true" />
          Retour à mon accueil
        </Link>
        <Link
          href="/"
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
          Page d&apos;accueil publique
        </Link>
      </nav>
    </main>
  );
}
