/**
 * Écran affiché à un user authentifié dont le rôle n'est ni "student" ni
 * "teacher" (typiquement : compte legacy, role manquant dans app_metadata,
 * ou rôle inconnu après une migration). Évite la boucle infinie
 * `/accueil` → `/login` → `/accueil` quand le user est auth mais sans rôle.
 *
 * UX : ton adulte bienveillant, contact support clair, possibilité de se
 * déconnecter pour revenir à la landing.
 */
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function UnknownRoleScreen({ email }: { email?: string | null }) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "global" });
    window.location.href = "/";
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Compte non reconnu
      </h1>
      <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-400">
        Ton compte est bien authentifié{email ? ` (${email})` : ""}, mais ton
        rôle n&apos;est pas encore configuré sur Maïa.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-500">
        Contacte le support à{" "}
        <a
          href="mailto:pilotes@maia.app"
          className="font-medium text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400"
        >
          pilotes@maia.app
        </a>{" "}
        pour qu&apos;on t&apos;active.
      </p>
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="mt-8 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {signingOut ? "Déconnexion…" : "Se déconnecter"}
      </button>
    </main>
  );
}
