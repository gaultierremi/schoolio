import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Maïa — Mockups",
  robots: { index: false, follow: false },
};

type Mockup = {
  slug: string;
  title: string;
  audience: "Élève" | "Prof" | "Marketing";
  description: string;
};

const MOCKUPS: Mockup[] = [
  {
    slug: "dashboard-eleve-session-mockup.html",
    title: "Session adaptive — tuteur IA en action",
    audience: "Élève",
    description:
      "Layout 2 colonnes : énoncé + correction pas-à-pas à gauche, tuteur IA + mastery delta + adaptive decision card à droite.",
  },
  {
    slug: "dashboard-eleve-heatmap-mockup.html",
    title: "Heatmap progression",
    audience: "Élève",
    description: "Vue d'ensemble des concepts maîtrisés par chapitre, mastery par niveau de couleur.",
  },
  {
    slug: "dashboard-prof-heatmap-mockup.html",
    title: "Heatmap classe",
    audience: "Prof",
    description: "Heatmap par élève × concept pour détecter les zones de fragilité collective.",
  },
  {
    slug: "landing-page-mockup.html",
    title: "Landing page",
    audience: "Marketing",
    description: "Page d'accueil publique itération design.",
  },
  {
    slug: "mockup-redesign.html",
    title: "Redesign général",
    audience: "Marketing",
    description: "Exploration design system / palette / typographie.",
  },
];

const audienceColor: Record<Mockup["audience"], string> = {
  Élève: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  Prof: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  Marketing: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
};

export default function MockupsIndexPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-12 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Maïa · Internal
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-gray-900 dark:text-gray-100">
            Mockups
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Snapshots HTML des designs validés. Source de vérité avant implémentation.
            Mis à jour manuellement depuis <code className="rounded bg-gray-200 px-1 py-0.5 text-xs dark:bg-gray-800">docs/*mockup*.html</code>.
          </p>
        </header>

        <ul className="space-y-3">
          {MOCKUPS.map((m) => (
            <li key={m.slug}>
              <Link
                href={`/mockups/${m.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-gray-200 bg-white p-5 transition hover:border-violet-400 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-violet-500"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${audienceColor[m.audience]}`}
                      >
                        {m.audience}
                      </span>
                      <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                        {m.title}
                      </h2>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      {m.description}
                    </p>
                    <p className="mt-2 font-mono text-xs text-gray-400 dark:text-gray-500">
                      /mockups/{m.slug}
                    </p>
                  </div>
                  <span aria-hidden="true" className="text-gray-400 dark:text-gray-500">
                    →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <footer className="mt-10 border-t border-gray-200 pt-6 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Page non indexée. Pour ajouter un mockup : copier le HTML dans{" "}
          <code className="rounded bg-gray-200 px-1 py-0.5 dark:bg-gray-800">public/mockups/</code>{" "}
          et l'ajouter à la liste dans{" "}
          <code className="rounded bg-gray-200 px-1 py-0.5 dark:bg-gray-800">app/mockups/page.tsx</code>.
        </footer>
      </div>
    </main>
  );
}
