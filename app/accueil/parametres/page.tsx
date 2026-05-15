import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Lock,
  ShieldCheck,
  Trash2,
  UserCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Hub paramètres /accueil/parametres (Sprint 1A).
 *
 * Liste les sous-pages disponibles + placeholders Sprint 1B (export Art. 20
 * + suppression Art. 17). UX transparente : ce qui n'est pas dispo est marqué
 * "Bientôt — Sprint 1B" plutôt que caché.
 */
export default async function ParametresHubPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 lg:py-12">
      <Link
        href="/accueil"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        Accueil
      </Link>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Paramètres
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Gestion de ton compte et de tes données.
      </p>

      <nav className="mt-8 space-y-3">
        <SettingCard
          href="/accueil/parametres/compte"
          Icon={UserCircle}
          title="Mon compte"
          description="Tes informations Maïa et tes classes."
        />
        <SettingCard
          href="/accueil/parametres/confidentialite"
          Icon={ShieldCheck}
          title="Confidentialité"
          description="Tes consentements RGPD et journal d'activité."
        />
        <SettingCard
          href="/auth/pin-unlock"
          Icon={Lock}
          title="Code PIN"
          description="Modifier ou réinitialiser ton PIN (via PIN oublié)."
        />
        <SettingCard
          href="/accueil/parametres/export-donnees"
          Icon={Download}
          title="Exporter mes données"
          description="Télécharger toutes tes données en JSON (RGPD Art. 20)."
        />
        <SettingCard
          href="/accueil/parametres/suppression-compte"
          Icon={Trash2}
          title="Supprimer mon compte"
          description="Effacer ton compte et anonymiser tes données (RGPD Art. 17)."
        />
      </nav>
    </div>
  );
}

function SettingCard({
  href,
  Icon,
  title,
  description,
}: {
  href: string;
  Icon: typeof UserCircle;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800"
    >
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300">
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </p>
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
          {description}
        </p>
      </div>
    </Link>
  );
}

