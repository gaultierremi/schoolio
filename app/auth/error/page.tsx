import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Page d'erreur générique auth (Sprint 1A).
 *
 * Reçoit ?error=<code> et ?description=<msg> depuis Supabase OAuth callback
 * ou autres flows (PIN lockout = redirect ici par exemple, voir signOut+/login?error=pin_lockout).
 *
 * Affiche un message factuel + CTA retour /login + contact support.
 */
export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { error?: string; description?: string; error_description?: string };
}) {
  const code = searchParams.error ?? "unknown";
  const description =
    searchParams.description ??
    searchParams.error_description ??
    "Une erreur inattendue est survenue lors de la connexion.";

  // Map quelques codes connus vers un message clair pour l'utilisateur.
  const KNOWN_MESSAGES: Record<string, string> = {
    pin_lockout:
      "Trop d'échecs de PIN. Tu as été déconnecté par sécurité. Reconnecte-toi via Google puis configure un nouveau PIN.",
    access_denied:
      "Tu as refusé la connexion via Google. Si c'était une erreur, réessaie.",
    token_expired:
      "Ta session a expiré. Reconnecte-toi.",
    server_error:
      "Le serveur a rencontré un problème. Réessaie dans quelques instants.",
  };

  const userMessage = KNOWN_MESSAGES[code] ?? description;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300">
        <AlertTriangle size={24} strokeWidth={1.75} />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Connexion impossible
      </h1>
      <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-400">
        {userMessage}
      </p>
      {code !== "unknown" && code !== "pin_lockout" && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
          Code : <code className="font-mono">{code}</code>
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3 self-stretch">
        <Link
          href="/login"
          className="flex h-12 items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          Retour à la connexion
        </Link>
        <a
          href="mailto:pilotes@maia.app"
          className="text-xs text-slate-500 underline transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Contacter le support
        </a>
      </div>
    </main>
  );
}
