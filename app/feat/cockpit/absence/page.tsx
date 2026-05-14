"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { BedDouble, Copy, Check, ArrowLeft } from "lucide-react";
import Link from "next/link";

const STEPS = ["dates", "remplacant", "notes", "confirmation"] as const;
type Step = (typeof STEPS)[number];

const DATE_OPTIONS = [
  { id: "tomorrow", label: "Demain seulement", getValue: () => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return { start: d.toISOString().split("T")[0], end: d.toISOString().split("T")[0] };
  }},
  { id: "week", label: "Jusqu'à vendredi", getValue: () => {
    const d = new Date();
    const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
    const friday = new Date(); friday.setDate(d.getDate() + daysUntilFriday);
    return { start: new Date(d.setDate(d.getDate() + 1)).toISOString().split("T")[0], end: friday.toISOString().split("T")[0] };
  }},
  { id: "open", label: "Date à préciser", getValue: () => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return { start: d.toISOString().split("T")[0], end: null };
  }},
] as const;

const REPLACEMENT_OPTIONS = [
  "Mme Martin",
  "M. Dupont",
  "Mme Lefèvre",
  "Quelqu'un de l'équipe",
];

export default function AbsencePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("dates");
  const [dateOption, setDateOption] = useState<string | null>(null);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    const dateOpt = DATE_OPTIONS.find((o) => o.id === dateOption)!;
    const { start, end } = dateOpt.getValue();

    try {
      const res = await fetch("/api/feat/cockpit/absence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulaire_name: "Prof titulaire", // mock pour POC
          start_date: start,
          end_date: end,
          replacement_name: replacement,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erreur"); return; }
      setGeneratedCode(json.replacement_code);
      setStep("confirmation");
    } catch {
      setError("Réseau indisponible");
    } finally {
      setLoading(false);
    }
  }

  function copyCode() {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const fadeProps = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.35, ease: "easeOut" },
  };

  return (
    <main className="min-h-screen bg-[rgb(var(--background))] px-5 pb-10">
      <div className="mx-auto max-w-md pt-6">
        <Link href="/feat/cockpit" className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--foreground))] transition-colors mb-8">
          <ArrowLeft size={15} /> Cockpit
        </Link>

        <AnimatePresence mode="wait">
          {step !== "confirmation" && (
            <motion.div key="header" {...fadeProps}>
              <div className="mb-8 flex flex-col items-start gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100">
                  <BedDouble className="text-violet-600" size={26} />
                </div>
                <h1 className="font-serif text-2xl font-bold text-[rgb(var(--foreground))] leading-tight">
                  Je serai absent·e
                </h1>
                <p className="text-sm text-[rgb(var(--muted))] leading-relaxed">
                  Maia s'occupe de briefer ton remplaçant. Tu n'as rien d'autre à faire.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* Étape 1 : dates */}
          {step === "dates" && (
            <motion.div key="dates" {...fadeProps} className="space-y-4">
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Quand seras-tu absent·e ?</p>
              {DATE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setDateOption(opt.id)}
                  className={`w-full rounded-2xl border p-4 text-left text-sm font-medium transition-all ${
                    dateOption === opt.id
                      ? "border-violet-400 bg-violet-50 text-violet-800"
                      : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => setStep("remplacant")}
                disabled={!dateOption}
                className="mt-2 w-full rounded-2xl bg-violet-600 py-4 text-base font-semibold text-white disabled:opacity-30 hover:bg-violet-700 active:scale-[0.98] transition-all"
              >
                Continuer
              </button>
            </motion.div>
          )}

          {/* Étape 2 : remplaçant */}
          {step === "remplacant" && (
            <motion.div key="remplacant" {...fadeProps} className="space-y-4">
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Qui te remplace ?</p>
              {REPLACEMENT_OPTIONS.map((name) => (
                <button
                  key={name}
                  onClick={() => setReplacement(name)}
                  className={`w-full rounded-2xl border p-4 text-left text-sm font-medium transition-all ${
                    replacement === name
                      ? "border-violet-400 bg-violet-50 text-violet-800"
                      : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                  }`}
                >
                  {name}
                </button>
              ))}
              <button
                onClick={() => setStep("notes")}
                disabled={!replacement}
                className="mt-2 w-full rounded-2xl bg-violet-600 py-4 text-base font-semibold text-white disabled:opacity-30 hover:bg-violet-700 active:scale-[0.98] transition-all"
              >
                Continuer
              </button>
            </motion.div>
          )}

          {/* Étape 3 : notes */}
          {step === "notes" && (
            <motion.div key="notes" {...fadeProps} className="space-y-4">
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Quelque chose à savoir ?</p>
              <p className="text-xs text-[rgb(var(--muted))]">Optionnel — Maia complétera le briefing automatiquement.</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex : Lucas a tendance à décrocher en fin de cours. On en est à la page 12…"
                rows={5}
                maxLength={2000}
                className="w-full rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-800 placeholder-stone-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20 resize-none"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full rounded-2xl bg-violet-600 py-4 text-base font-semibold text-white hover:bg-violet-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  "Générer le code remplaçant"
                )}
              </button>
              <button
                onClick={() => { setNotes(""); handleSubmit(); }}
                disabled={loading}
                className="w-full text-center text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--foreground))] transition-colors py-2"
              >
                Passer — Maia s'en charge
              </button>
            </motion.div>
          )}

          {/* Confirmation */}
          {step === "confirmation" && generatedCode && (
            <motion.div key="confirmation" {...fadeProps} className="flex flex-col items-center text-center gap-6 pt-4">
              <div className="text-5xl">🛌</div>
              <div>
                <h2 className="font-serif text-2xl font-bold text-[rgb(var(--foreground))] leading-tight">
                  Donne ce code à ton remplaçant·e
                </h2>
                <p className="mt-2 text-sm text-[rgb(var(--muted))] leading-relaxed">
                  Maia s'occupe du reste. Repose-toi.
                </p>
              </div>

              <div className="w-full rounded-3xl bg-violet-50 border border-violet-200 px-6 py-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-500 mb-2">Code remplaçant</p>
                <p className="font-mono text-5xl font-bold tracking-[0.2em] text-violet-700 select-all">
                  {generatedCode}
                </p>
              </div>

              <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={copyCode}
                  className="flex items-center justify-center gap-2 w-full rounded-2xl border border-violet-300 bg-white py-3.5 text-sm font-semibold text-violet-700 hover:bg-violet-50 active:scale-[0.98] transition-all"
                >
                  {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                  {copied ? "Copié !" : "Copier le code"}
                </button>
                <button
                  onClick={() => alert("SMS mock — en production, un SMS sera envoyé automatiquement.")}
                  className="w-full rounded-2xl border border-stone-200 bg-white py-3.5 text-sm font-semibold text-stone-600 hover:bg-stone-50 active:scale-[0.98] transition-all"
                >
                  Envoyer par SMS (mock)
                </button>
              </div>

              <p className="text-xs text-[rgb(var(--muted))] leading-relaxed px-4">
                Ton remplaçant entre ce code sur <strong>maia.app/cockpit/replace</strong> et reçoit un briefing complet. Tu ne seras plus contacté.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
