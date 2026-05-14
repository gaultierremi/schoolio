"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { routeAIRequest } from "@/lib/ai-router";

// This page is called when the titulaire returns.
// For the POC, we generate a zen return report from recent replacement sessions.

type ReturnReport = {
  held: string;
  toAddress: string;
  suggestion: string;
  detail?: string;
};

const MOCK_RETURN: ReturnReport = {
  held: "Le programme des 2 derniers chapitres a été couvert comme prévu. Les élèves ont bien travaillé, l'ambiance était sereine.",
  toAddress: "Lucas D. a semblé décrocher sur la partie \"forces de friction\" — prévoir un rappel rapide en début de prochain cours.",
  suggestion: "Démarrer par 5 minutes de questions ouvertes pour reprendre le fil avec la classe. Rien de plus.",
};

export default function ReturnPage() {
  const [report, setReport] = useState<ReturnReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailExpanded, setDetailExpanded] = useState(false);

  useEffect(() => {
    // For POC: use mock report with slight delay to feel "AI generated"
    const t = setTimeout(() => {
      setReport(MOCK_RETURN);
      setLoading(false);
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  const fadeUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
  };

  return (
    <main className="min-h-screen bg-stone-50 px-5 pb-16">
      <div className="mx-auto max-w-sm pt-12">
        {/* Greeting */}
        <motion.div {...fadeUp} className="text-center mb-10">
          <div className="text-4xl mb-4">🌿</div>
          <h1 className="font-serif text-3xl font-bold text-stone-900 leading-tight">
            Bon retour
          </h1>
          <p className="mt-2 text-sm text-stone-500 leading-relaxed">
            Tu as été remplacé·e. Voici l'essentiel — prends ton temps.
          </p>
        </motion.div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-stone-100 bg-white p-5 animate-pulse">
                <div className="h-3 w-20 rounded-full bg-stone-100 mb-3" />
                <div className="space-y-2">
                  <div className="h-3.5 w-full rounded-full bg-stone-100" />
                  <div className="h-3.5 w-4/5 rounded-full bg-stone-100" />
                </div>
              </div>
            ))}
          </div>
        ) : report ? (
          <motion.div
            initial="initial"
            animate="animate"
            variants={{ animate: { transition: { staggerChildren: 0.15 } } }}
            className="space-y-4"
          >
            {/* ✓ Ce qui a tenu */}
            <motion.div variants={fadeUp} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-2">
                ✓ Ce qui a tenu
              </p>
              <p className="text-sm text-stone-700 leading-relaxed">{report.held}</p>
            </motion.div>

            {/* ⚠ Ce qui mérite attention */}
            <motion.div variants={fadeUp} className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2">
                À noter
              </p>
              <p className="text-sm text-stone-700 leading-relaxed">{report.toAddress}</p>
            </motion.div>

            {/* 💡 1 suggestion */}
            <motion.div variants={fadeUp} className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600 mb-2">
                💡 Pour reprendre
              </p>
              <p className="text-sm text-stone-700 leading-relaxed">{report.suggestion}</p>
            </motion.div>

            {/* Optionnel : voir le détail */}
            <motion.div variants={fadeUp}>
              <button
                onClick={() => setDetailExpanded((e) => !e)}
                className="flex w-full items-center justify-center gap-1.5 py-3 text-xs text-stone-400 hover:text-stone-600 transition-colors"
              >
                {detailExpanded ? (
                  <><ChevronUp size={14} /> Masquer le détail</>
                ) : (
                  <><ChevronDown size={14} /> Voir tout le détail</>
                )}
              </button>

              {detailExpanded && (
                <div className="rounded-2xl border border-stone-100 bg-white p-4 text-xs text-stone-500 leading-relaxed space-y-2">
                  <p className="font-semibold text-stone-700">Sessions de remplacement :</p>
                  <p>2 sessions enregistrées · 2 PDFs couverts · 3 questions projetées</p>
                  <p>Transcriptions disponibles dans l'historique des sessions.</p>
                </div>
              )}
            </motion.div>

            {/* CTA discret */}
            <motion.div variants={fadeUp} className="pt-2 text-center">
              <a
                href="/feat/cockpit"
                className="text-sm text-stone-400 hover:text-violet-600 transition-colors underline-offset-2 hover:underline"
              >
                Reprendre le cockpit
              </a>
            </motion.div>
          </motion.div>
        ) : null}
      </div>
    </main>
  );
}
