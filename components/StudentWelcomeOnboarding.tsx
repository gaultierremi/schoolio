"use client";

import { useEffect, useState } from "react";

type Props = {
  displayName: string;
};

const STEPS = [
  {
    emoji: "🎒",
    title: "Bienvenue sur Schoolio !",
    body: "Ton espace élève centralise tes devoirs, tes classes et ton entraînement. Tout est ici.",
  },
  {
    emoji: "🔁",
    title: "La révision quotidienne",
    body: "Chaque jour, Schoolio te propose des questions sur tes points faibles. Quelques minutes suffisent pour progresser.",
  },
  {
    emoji: "🏫",
    title: "Tes classes",
    body: "Rejoins les classes de tes professeurs avec un code. Tu recevras directement leurs devoirs et exercices.",
  },
] as const;

export default function StudentWelcomeOnboarding({ displayName }: Props) {
  const [step, setStep] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") void handleDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function handleDismiss() {
    if (dismissing) return;
    setDismissing(true);
    await fetch("/api/student/dismiss-onboarding", { method: "POST" });
    setOpen(false);
  }

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) void handleDismiss(); }}
    >
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-7 text-center shadow-2xl">
        <div className="mb-3 text-4xl">{current.emoji}</div>
        <h2 className="mb-1 text-xl font-black text-white">
          {step === 0 && displayName ? `${current.title.replace("!", "")}, ${displayName} !` : current.title}
        </h2>
        <p className="mb-6 text-sm text-gray-400">{current.body}</p>

        {/* Step dots */}
        <div className="mb-6 flex justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-purple-500" : "w-1.5 bg-gray-700"
              }`}
            />
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {isLast ? (
            <button
              onClick={() => void handleDismiss()}
              disabled={dismissing}
              className="w-full rounded-xl bg-purple-600 py-2.5 font-black text-white transition hover:bg-purple-500 disabled:opacity-50"
            >
              C&apos;est parti !
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="w-full rounded-xl bg-purple-600 py-2.5 font-black text-white transition hover:bg-purple-500"
            >
              Suivant →
            </button>
          )}
          <button
            onClick={() => void handleDismiss()}
            disabled={dismissing}
            className="w-full py-2 text-sm text-gray-600 transition hover:text-gray-400 disabled:opacity-50"
          >
            Passer
          </button>
        </div>
      </div>
    </div>
  );
}
