"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn } from "lucide-react";

export default function StudentLiveEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleaned = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(cleaned)) {
      setError("Le code doit faire 6 caractères (lettres et chiffres).");
      return;
    }
    setJoining(true);
    try {
      const res = await fetch("/api/live/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleaned }),
      });
      const data = (await res.json()) as { session_id?: string; error?: string };
      if (!res.ok || !data.session_id) {
        setError(data.error ?? "Impossible de rejoindre.");
        setJoining(false);
        return;
      }
      router.push(`/accueil/rejoindre/${cleaned}`);
    } catch {
      setError("Erreur réseau. Réessaie.");
      setJoining(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950" lang="fr-BE">
      <div className="mx-auto w-full max-w-md">
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
          ← Mon espace
        </Link>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Rejoindre une session
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Saisis le code à 6 caractères que ton prof a projeté.
        </p>

        <form onSubmit={handleJoin} className="mt-8 space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- Live join: focus immediat sur code (eleve scanne QR / saisit immediatement)
            autoFocus
            inputMode="text"
            // colorScheme: light defeats Chrome's native dark input rendering
            // (cf. fix similaire ShortTextInput / NumericInput, hard review 2026-05-24).
            style={{ colorScheme: "light" }}
            className="
              w-full rounded-xl border border-slate-300 bg-white px-6 py-4
              text-center font-mono text-3xl font-semibold uppercase tracking-widest text-slate-900
              transition outline-none placeholder-slate-400
              focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20
              dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100
              motion-reduce:transition-none
            "
          />
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={joining || code.length !== 6}
            className="
              inline-flex w-full items-center justify-center gap-1.5 rounded-lg
              bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition
              hover:bg-indigo-700
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
              dark:focus-visible:ring-offset-slate-950
              disabled:cursor-not-allowed disabled:opacity-50
              motion-reduce:transition-none
            "
          >
            <LogIn size={16} strokeWidth={2} aria-hidden="true" />
            {joining ? "Connexion…" : "Rejoindre"}
          </button>
        </form>
      </div>
    </main>
  );
}
