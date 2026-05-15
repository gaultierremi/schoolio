import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase-server";
import DeleteAccountClient from "./DeleteAccountClient";

export const dynamic = "force-dynamic";

/**
 * Page suppression de compte (Sprint 1B — RGPD Art. 17 droit à l'oubli).
 *
 * UX :
 * - Disclaimer clair : ce qui est anonymisé vs supprimé
 * - Double confirmation : checkbox + saisie "SUPPRIMER" en clair
 * - POST /api/parametres/delete-account → INSERT anonymized_users + nettoyage
 *   user_profiles PII + clear PIN/cookie + signOut global
 *
 * Conforme règle interne #23 CLAUDE.md : pas de DELETE sur tables
 * événementielles. Les rows restent avec student_user_id intact, mais les
 * vues affichent "Utilisateur supprimé" via JOIN anonymized_users.
 */
export default async function SuppressionComptePage() {
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
        Supprimer mon compte
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Action irréversible. RGPD Art. 17 droit à l&apos;effacement.
      </p>

      <DeleteAccountClient userEmail={user.email ?? ""} />
    </div>
  );
}
