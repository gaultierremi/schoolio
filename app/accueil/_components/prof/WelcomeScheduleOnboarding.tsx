"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";

type Props = {
  firstName: string;
  onDismiss: () => void;
};

export function WelcomeScheduleOnboarding({ firstName, onDismiss }: Props) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") void handleLater();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function handleLater() {
    await fetch("/api/school/schedule/dismiss-onboarding", { method: "POST" });
    onDismiss();
  }

  function handleNow() {
    void fetch("/api/school/schedule/dismiss-onboarding", { method: "POST" });
    router.push("/accueil/horaire");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) void handleLater(); }}
    >
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-7 text-center shadow-xl">
        <CalendarDays className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--accent))]" aria-hidden />
        <h2 className="serif mb-2 text-xl font-bold text-[rgb(var(--ink))]">
          Bienvenue{firstName ? `, ${firstName}` : ""} !
        </h2>
        <p className="mb-6 text-sm text-[rgb(var(--ink-2))]">
          Configure ton horaire pour que Maïa affiche tes cours du moment et t&apos;aide à mieux t&apos;organiser.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleNow}
            className="w-full rounded-xl bg-[rgb(var(--accent))] py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Configurer maintenant
          </button>
          <button
            onClick={() => void handleLater()}
            className="w-full py-2 text-sm text-[rgb(var(--ink-3))] transition hover:text-[rgb(var(--ink-2))]"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}
