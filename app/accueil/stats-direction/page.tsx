import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { requireTeacherPage } from "@/lib/auth/role";
import StatsDirectionClient from "./StatsDirectionClient";

export const dynamic = "force-dynamic";

/**
 * Sprint 6 PR S6-12 — Page stats direction (vue agrégée toutes classes du prof).
 *
 * Server component minimal : auth + délégation au client (le client fetch via
 * l'API pour pouvoir refresh sans full reload).
 *
 * Accessible à tout prof (= teacher). Pour les pilotes, la "direction" sera
 * jouée par le founder/prof référent. Une vrai rôle `school_admin` pourra
 * être ajouté post-MVP si une école en demande un (memo
 * `project_role_model_2_values`).
 */
export const metadata = {
  title: "Stats direction · Maïa",
};

export default async function StatsDirectionPage() {
  await requireTeacherPage();

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 py-6 sm:px-6" lang="fr-BE">
      <nav aria-label="Fil d'Ariane" className="mb-4">
        <Link
          href="/accueil"
          className="
            inline-flex items-center gap-1.5 rounded-md text-sm text-slate-600 transition
            hover:text-slate-900
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
            dark:text-slate-400 dark:hover:text-slate-200
            dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
          Retour à l&apos;accueil
        </Link>
      </nav>

      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
          Vue direction
        </p>
        <div className="mt-2 flex items-start gap-3">
          <div
            aria-hidden="true"
            className="
              flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
              bg-indigo-600 text-white
            "
          >
            <BarChart3 size={18} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Stats agrégées
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Vue d&apos;ensemble de toutes tes classes : effectifs, scores,
              maîtrise, concepts faibles à travailler en priorité.
            </p>
          </div>
        </div>
      </header>

      <StatsDirectionClient />
    </main>
  );
}
