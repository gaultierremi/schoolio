import { readFile } from "fs/promises";
import path from "path";
import ReactMarkdown from "react-markdown";

/**
 * Composant server qui affiche un draft juridique du dossier docs/legal-drafts/.
 *
 * Architecture (Sprint 1A Phase D — critique #4) : 1 composant factorisé qui
 * lit le markdown source au build et le rend via react-markdown. Les 4 pages
 * /legal/{cgu,mentions-legales,confidentialite,cookies}/page.tsx se résument
 * à `<LegalPage slug="..." />`.
 *
 * Si tu veux modifier un texte juridique, édite le fichier markdown source :
 * docs/legal-drafts/{slug}-fr-be-draft.md
 *
 * Les drafts ont été rédigés par un sub-agent puis vérifiés. Avant tout pilote
 * école payant, faire valider par un juriste BE (disclaimer en haut de chaque
 * fichier).
 */

type LegalSlug = "cgu" | "mentions-legales" | "confidentialite" | "cookies";

const SLUG_TO_FILE: Record<LegalSlug, string> = {
  cgu: "cgu-fr-be-draft.md",
  "mentions-legales": "mentions-legales-fr-be-draft.md",
  confidentialite: "politique-confidentialite-fr-be-draft.md",
  cookies: "politique-cookies-fr-be-draft.md",
};

async function readLegalDraft(slug: LegalSlug): Promise<string> {
  const filePath = path.join(process.cwd(), "docs", "legal-drafts", SLUG_TO_FILE[slug]);
  return readFile(filePath, "utf8");
}

export default async function LegalPage({ slug }: { slug: LegalSlug }) {
  const markdown = await readLegalDraft(slug);

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <div className="prose-legal">
        <ReactMarkdown
          components={{
            h1: (props) => (
              <h1
                className="mb-6 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100"
                {...props}
              />
            ),
            h2: (props) => (
              <h2
                className="mt-8 mb-3 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100"
                {...props}
              />
            ),
            h3: (props) => (
              <h3
                className="mt-6 mb-2 text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100"
                {...props}
              />
            ),
            p: (props) => (
              <p
                className="mb-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300"
                {...props}
              />
            ),
            ul: (props) => (
              <ul
                className="mb-4 list-disc pl-6 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300"
                {...props}
              />
            ),
            ol: (props) => (
              <ol
                className="mb-4 list-decimal pl-6 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300"
                {...props}
              />
            ),
            li: (props) => <li className="mb-1" {...props} />,
            strong: (props) => (
              <strong className="font-semibold text-slate-900 dark:text-slate-100" {...props} />
            ),
            a: (props) => (
              // eslint-disable-next-line jsx-a11y/anchor-has-content -- children passes via {...props} from react-markdown
              <a
                className="text-indigo-600 underline transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                {...props}
              />
            ),
            code: (props) => (
              <code
                className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                {...props}
              />
            ),
            table: (props) => (
              <div className="my-4 overflow-x-auto">
                <table
                  className="w-full border-collapse text-sm text-slate-700 dark:text-slate-300"
                  {...props}
                />
              </div>
            ),
            th: (props) => (
              <th
                className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                {...props}
              />
            ),
            td: (props) => (
              <td
                className="border-b border-slate-100 px-3 py-2 align-top dark:border-slate-800"
                {...props}
              />
            ),
            blockquote: (props) => (
              <blockquote
                className="my-4 border-l-4 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
                {...props}
              />
            ),
            hr: () => <hr className="my-8 border-slate-200 dark:border-slate-800" />,
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </article>
  );
}
