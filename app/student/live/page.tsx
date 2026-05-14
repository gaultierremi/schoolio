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
      router.push(`/student/live/${cleaned}`);
    } catch {
      setError("Erreur réseau. Réessaie.");
      setJoining(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        <Link href="/student" className="text-sm text-gray-500 hover:text-gray-300">
          ← Mon espace
        </Link>

        <h1 className="mt-4 text-3xl font-black">Rejoindre une session</h1>
        <p className="mt-1 text-sm text-gray-400">
          Saisis le code à 6 caractères que ton prof a projeté.
        </p>

        <form onSubmit={handleJoin} className="mt-8 space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            autoFocus
            inputMode="text"
            className="w-full rounded-2xl border-2 border-gray-700 bg-gray-900 px-6 py-5 text-center font-mono text-3xl font-black uppercase tracking-widest text-white outline-none transition focus:border-purple-500"
          />
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={joining || code.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-500 py-4 font-black text-gray-950 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogIn className="h-5 w-5" />
            {joining ? "Connexion…" : "Rejoindre"}
          </button>
        </form>
      </div>
    </main>
  );
}
