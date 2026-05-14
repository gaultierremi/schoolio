"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BookOpen, Handshake, BedDouble, Monitor, ArrowRight } from "lucide-react";
import { DEMO_PDFS } from "@/lib/cockpit/session";

type DemoPdf = (typeof DEMO_PDFS)[number];

export default function CockpitPage() {
  const router = useRouter();
  const [selectedPdf, setSelectedPdf] = useState<DemoPdf | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStartSession() {
    if (!selectedPdf) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/feat/cockpit/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf_key: selectedPdf.key }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erreur"); return; }
      router.push(`/feat/cockpit/session/${json.code}`);
    } catch {
      setError("Réseau indisponible.");
    } finally {
      setLoading(false);
    }
  }

  const fadeUp = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
  };

  return (
    <main className="min-h-screen bg-[rgb(var(--background))] px-5 pb-16">
      <div className="mx-auto max-w-sm pt-10">
        <motion.div {...fadeUp}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500 mb-1">
            Maia Cockpit
          </p>
          <h1 className="font-serif text-3xl font-bold text-[rgb(var(--foreground))] leading-tight mb-1">
            Bonjour, prof.
          </h1>
          <p className="text-sm text-[rgb(var(--muted))] mb-8">
            Que veux-tu faire aujourd'hui ?
          </p>
        </motion.div>

        {/* Quick actions */}
        <motion.div
          {...fadeUp}
          className="grid grid-cols-2 gap-3 mb-8"
          style={{ animationDelay: "0.05s" }}
        >
          <a
            href="/feat/cockpit/absence"
            className="flex flex-col items-start gap-2 rounded-2xl border border-stone-200 bg-white p-4 hover:border-violet-300 hover:shadow-sm transition-all"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100">
              <BedDouble size={18} className="text-violet-600" />
            </div>
            <p className="text-sm font-semibold text-stone-800 leading-tight">Je serai absent·e</p>
            <p className="text-[11px] text-stone-400 leading-snug">Code remplaçant en 3 taps</p>
          </a>

          <a
            href="/feat/cockpit/replace"
            className="flex flex-col items-start gap-2 rounded-2xl border border-stone-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition-all"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
              <Handshake size={18} className="text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-stone-800 leading-tight">Je remplace</p>
            <p className="text-[11px] text-stone-400 leading-snug">Briefing IA instantané</p>
          </a>

          <a
            href="/feat/cockpit/display"
            className="flex flex-col items-start gap-2 rounded-2xl border border-stone-200 bg-white p-4 hover:border-stone-300 hover:shadow-sm transition-all"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100">
              <Monitor size={18} className="text-stone-600" />
            </div>
            <p className="text-sm font-semibold text-stone-800 leading-tight">Projecteur</p>
            <p className="text-[11px] text-stone-400 leading-snug">Afficher les questions</p>
          </a>

          <a
            href="/feat/cockpit/return"
            className="flex flex-col items-start gap-2 rounded-2xl border border-stone-200 bg-white p-4 hover:border-stone-300 hover:shadow-sm transition-all"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
              <span className="text-lg">🌿</span>
            </div>
            <p className="text-sm font-semibold text-stone-800 leading-tight">Mon retour</p>
            <p className="text-[11px] text-stone-400 leading-snug">Rapport de remplacement</p>
          </a>
        </motion.div>

        {/* Session picker */}
        <motion.div {...fadeUp} style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={15} className="text-stone-400" />
            <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
              Démarrer un cours
            </p>
          </div>
          <div className="space-y-2 mb-4">
            {DEMO_PDFS.map((pdf) => (
              <button
                key={pdf.key}
                onClick={() => setSelectedPdf(pdf)}
                className={`w-full rounded-2xl border p-4 text-left transition-all ${
                  selectedPdf?.key === pdf.key
                    ? "border-violet-400 bg-violet-50"
                    : "border-stone-200 bg-white hover:border-stone-300"
                }`}
              >
                <p className={`text-sm font-semibold leading-tight ${
                  selectedPdf?.key === pdf.key ? "text-violet-800" : "text-stone-800"
                }`}>
                  {pdf.title}
                </p>
                <p className="text-xs text-stone-500 mt-0.5">{pdf.subject}</p>
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

          <button
            onClick={handleStartSession}
            disabled={!selectedPdf || loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-4 text-base font-semibold text-white disabled:opacity-30 hover:bg-violet-700 active:scale-[0.98] transition-all"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>Démarrer le cours <ArrowRight size={18} /></>
            )}
          </button>

          <p className="mt-3 text-center text-xs text-stone-400">
            Un code de session sera généré pour le projecteur.
          </p>
        </motion.div>
      </div>
    </main>
  );
}
