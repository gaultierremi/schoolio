"use client";

import { useEffect, useState } from "react";
import BetaFeedbackOverlay from "@/components/beta/BetaFeedbackOverlay";

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}
import type { BetaFeedbackPayload } from "@/components/beta/BetaFeedbackOverlay";

export default function BetaFeedbackButton() {
  // TODO: gate on user_profiles.beta_tester once column exists
  const isVisible = true;
  const [isOpen, setIsOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (!showToast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setShowToast(false), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [showToast]);

  if (!isVisible) {
    return null;
  }

  function handleSubmitted(_payload: BetaFeedbackPayload) {
    setIsOpen(false);
    setShowToast(true);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Envoyer un retour vocal beta"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-[80] flex h-14 w-14 items-center justify-center rounded-full border border-purple-400/40 bg-purple-500 text-gray-950 shadow-2xl shadow-purple-950/40 transition hover:scale-105 hover:bg-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:ring-offset-2 focus:ring-offset-gray-950 sm:bottom-6 sm:right-6"
      >
        <MicIcon className="h-6 w-6" />
      </button>

      <BetaFeedbackOverlay
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSubmit={handleSubmitted}
      />

      {showToast ? (
        <div
          role="status"
          className="fixed bottom-20 right-4 z-[80] rounded-2xl border border-green-500/30 bg-gray-900 px-4 py-3 text-sm font-bold text-green-300 shadow-xl shadow-black/30 sm:bottom-24 sm:right-6"
        >
          Retour envoyé ✅
        </div>
      ) : null}
    </>
  );
}
