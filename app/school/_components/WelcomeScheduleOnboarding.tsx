"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

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
    router.push("/school/schedule");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) void handleLater(); }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-7 text-center">
        <div className="text-4xl mb-3">🗓️</div>
        <h2 className="text-xl font-bold text-white mb-2">
          👋 Bienvenue{firstName ? `, ${firstName}` : ""} !
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          Configure ton emploi du temps pour que Maïa affiche tes cours du moment et t'aide à mieux t'organiser.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleNow}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
          >
            Configurer maintenant
          </button>
          <button
            onClick={() => void handleLater()}
            className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}
