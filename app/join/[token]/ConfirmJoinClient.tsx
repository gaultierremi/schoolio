"use client";

import { useState } from "react";

type Props = {
  token: string;
  className: string;
  teacherName?: string;
  userEmail: string;
  /** Membership déjà active — le clic ne sert alors qu'au backfill profil/rôle. */
  alreadyMember: boolean;
};

type JoinResponse = {
  ok?: boolean;
  error?: string;
  reason?: string;
};

/**
 * Écran de confirmation « je rejoins cette classe » pour un utilisateur déjà
 * authentifié (SSO). Les cas terminaux (classe archivée, inscriptions fermées,
 * lien expiré, compte prof, déjà membre) sont traités côté serveur dans
 * page.tsx : si ce composant s'affiche, le rattachement est a priori possible.
 */
export default function ConfirmJoinClient({
  token,
  className,
  teacherName,
  userEmail,
  alreadyMember,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  const loginHref = `/login?next=${encodeURIComponent(`/join/${token}`)}`;

  async function handleJoin() {
    setLoading(true);
    setError(null);
    setNeedsReauth(false);

    let res: Response;
    try {
      res = await fetch("/api/join/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch {
      setError("Connexion perdue. Vérifie ton réseau et réessaie.");
      setLoading(false);
      return;
    }

    const json = (await res.json().catch(() => ({}))) as JoinResponse;

    if (!res.ok) {
      // 401 ET 500 sont tous les deux des symptômes d'auth : requireUser()
      // renvoie 401 quand il n'y a pas de session, mais 500 quand
      // supabase.auth.getUser() échoue — typiquement un refresh token expiré.
      // 401 : on renvoie directement au login.
      // 500 : ambigu (ça peut aussi être une vraie panne DB derrière
      // safeError), donc on affiche le message ET un lien de reconnexion
      // plutôt que de boucler l'utilisateur sur /login si le serveur tousse.
      if (res.status === 401) {
        window.location.href = loginHref;
        return;
      }
      if (res.status === 500) {
        setNeedsReauth(true);
      }
      setError(json.error ?? "Impossible de rejoindre la classe");
      setLoading(false);
      return;
    }

    // window.location.href, JAMAIS router.push : la route vient (peut-être) de
    // muter app_metadata.role côté serveur, et cette mutation n'est pas dans le
    // JWT que porte l'onglet. Un router.push ferait une navigation soft qui
    // repasse au middleware avec l'ancien token → rôle absent →
    // UnknownRoleScreen. Un rechargement complet force le refresh de session.
    window.location.href = "/accueil";
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[rgb(var(--surface-2))] px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-5xl">🎒</p>
          <h1 className="serif mt-4 text-3xl font-bold text-[rgb(var(--ink))]">
            Rejoindre {className}
          </h1>
          {teacherName ? (
            <p className="mt-2 text-sm text-[rgb(var(--ink-2))]">
              Classe de {teacherName}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
          <p className="text-center text-xs text-[rgb(var(--ink-3))]">
            Connecté : <span className="text-[rgb(var(--ink-2))]">{userEmail}</span>
          </p>

          <p className="mt-4 text-center text-sm text-[rgb(var(--ink-2))]">
            {alreadyMember
              ? "Tu fais déjà partie de cette classe. Confirme pour finaliser ton compte élève."
              : "Confirme pour rejoindre cette classe avec ce compte."}
          </p>

          {error ? (
            <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-center text-sm text-red-500">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleJoin}
            disabled={loading}
            className="mt-5 w-full rounded-2xl bg-[rgb(var(--accent))] px-5 py-3 text-sm font-bold text-white transition disabled:opacity-50"
          >
            {loading
              ? "Un instant…"
              : alreadyMember
                ? "Continuer"
                : "Rejoindre la classe"}
          </button>

          {needsReauth ? (
            <p className="mt-3 text-center text-xs text-[rgb(var(--ink-3))]">
              Ta session a peut-être expiré.{" "}
              <a href={loginHref} className="underline hover:text-[rgb(var(--ink-2))]">
                Se reconnecter
              </a>
            </p>
          ) : null}
        </div>

        <p className="text-center text-xs text-[rgb(var(--ink-3))]">
          <a href="/join" className="hover:text-[rgb(var(--ink-2))]">
            Entrer un code à la place
          </a>
        </p>
      </div>
    </main>
  );
}
