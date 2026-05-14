"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, ArrowRight } from "lucide-react";

export default function DisplayEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase().replace(/\s/g, "");
    if (!/^[A-Z2-9]{6}$/i.test(trimmed)) {
      setError("Le code est composé de 6 caractères (lettres et chiffres).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/feat/cockpit/display/${trimmed}`);
      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Session introuvable.");
        return;
      }
      router.push(`/feat/cockpit/display/${trimmed}`);
    } catch {
      setError("Réseau indisponible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-950 px-5">
      <div className="mx-auto max-w-sm flex flex-col items-center text-center pt-20 gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/20 border border-violet-500/30">
          <Monitor className="text-violet-400" size={28} />
        </div>

        <div>
          <h1 className="font-serif text-2xl font-bold text-white">
            Écran de classe
          </h1>
          <p className="mt-2 text-sm text-stone-400 leading-relaxed">
            Entre le code de session pour afficher les questions sur le projecteur.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <input
            type="text"
            inputMode="text"
            maxLength={6}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/gi, ""));
              setError(null);
            }}
            placeholder="ABC123"
            className="w-full rounded-2xl border border-stone-700 bg-stone-900 px-5 py-4 text-center font-mono text-3xl font-bold tracking-[0.3em] text-white placeholder-stone-700 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-4 text-base font-semibold text-white disabled:opacity-30 hover:bg-violet-700 active:scale-[0.98] transition-all"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>Afficher la session <ArrowRight size={18} /></>
            )}
          </button>
        </form>

        <p className="text-xs text-stone-600">
          Code communiqué par l'enseignant en début de cours.
        </p>
      </div>
    </main>
  );
}
