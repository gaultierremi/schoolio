"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake, ArrowRight } from "lucide-react";

export default function ReplacePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().replace(/\s/g, "");
    if (!/^[0-9]{6}$/.test(trimmed)) {
      setError("Le code est composé de 6 chiffres");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/feat/cockpit/absence?code=${trimmed}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Code invalide"); return; }
      router.push(`/feat/cockpit/replace/${trimmed}/briefing`);
    } catch {
      setError("Réseau indisponible");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[rgb(var(--background))] px-5">
      <div className="mx-auto max-w-sm flex flex-col items-center text-center pt-20 gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
          <Handshake className="text-emerald-600" size={28} />
        </div>

        <div>
          <h1 className="font-serif text-2xl font-bold text-[rgb(var(--foreground))]">
            Bonjour, remplaçant·e
          </h1>
          <p className="mt-2 text-sm text-[rgb(var(--muted))] leading-relaxed">
            Entre le code que le prof titulaire t'a transmis. Maia t'a préparé un briefing complet.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setError(null); }}
            placeholder="000000"
            className="w-full rounded-2xl border border-stone-200 bg-white px-5 py-4 text-center font-mono text-3xl font-bold tracking-[0.3em] text-stone-800 placeholder-stone-300 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-base font-semibold text-white disabled:opacity-30 hover:bg-emerald-700 active:scale-[0.98] transition-all"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>Démarrer ma journée <ArrowRight size={18} /></>
            )}
          </button>
        </form>

        <p className="text-xs text-[rgb(var(--muted))]">
          Le code t'a été transmis par le prof titulaire, ou par la direction de l'établissement.
        </p>
      </div>
    </main>
  );
}
