import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase-server";
import ExportClient from "./ExportClient";

export const dynamic = "force-dynamic";

/**
 * Page export données (Sprint 1B — RGPD Art. 20 droit à la portabilité).
 *
 * Génère synchroniquement un fichier JSON avec :
 * - profil user (user_profiles)
 * - classes membre (élève) ou enseignées (prof)
 * - réponses aux quiz / devoirs (assignment_question_answers)
 * - mastery par concept
 * - audit log subset (sso_login, pin_*, consent_*)
 * - consent_records
 *
 * Format : JSON, téléchargement direct.
 */
export default async function ExportDataPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 lg:py-12">
      <Link
        href="/accueil/parametres"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        Paramètres
      </Link>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Exporter mes données
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Tout ce que Maïa a sur toi, dans un fichier JSON (RGPD Art. 20).
      </p>

      <ExportClient userEmail={user.email ?? ""} />
    </div>
  );
}
