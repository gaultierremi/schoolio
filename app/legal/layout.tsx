import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Layout commun aux pages /legal/* (Sprint 1A).
 *
 * Pages publiques : pas de check auth. Header retour + footer minimal.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white dark:bg-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <ArrowLeft size={14} strokeWidth={2} />
            Maïa
          </Link>
        </div>
      </header>

      {children}

      <footer className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-3xl flex-col items-start gap-2 px-6 py-6 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/legal/cgu" className="hover:text-slate-900 dark:hover:text-slate-200">
              CGU
            </Link>
            <Link
              href="/legal/mentions-legales"
              className="hover:text-slate-900 dark:hover:text-slate-200"
            >
              Mentions légales
            </Link>
            <Link
              href="/legal/confidentialite"
              className="hover:text-slate-900 dark:hover:text-slate-200"
            >
              Confidentialité
            </Link>
            <Link href="/legal/cookies" className="hover:text-slate-900 dark:hover:text-slate-200">
              Cookies
            </Link>
          </div>
          <a
            href="mailto:dpo@maia.app"
            className="hover:text-slate-900 dark:hover:text-slate-200"
          >
            dpo@maia.app
          </a>
        </div>
      </footer>
    </div>
  );
}
