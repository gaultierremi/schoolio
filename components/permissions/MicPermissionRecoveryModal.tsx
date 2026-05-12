"use client";

import { useId } from "react";

// 'dismissed' = user closed the browser permission popup without choosing.
//   CTA: "Réessayer maintenant" — re-triggers getUserMedia immediately.
// 'denied'    = user explicitly blocked mic in browser settings.
//   CTA: "J'ai réautorisé — Retester" — re-queries after manual settings change.
export type RecoveryReason = "dismissed" | "denied";

export type MicPermissionRecoveryModalProps = {
  isOpen: boolean;
  reason: RecoveryReason;
  onRetry: () => void;   // for 'dismissed': close modal + call start() from parent
  onRefresh: () => void; // for 'denied': re-query permissions after user resets settings
  onDismiss: () => void;
};

type BrowserKind =
  | "chrome-android"
  | "chrome-desktop"
  | "safari-ios"
  | "other";

function detectBrowser(): BrowserKind {
  if (typeof window === "undefined") return "other";
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isChrome = /Chrome/i.test(ua) && !/Edg|OPR/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua);
  if (isChrome && isAndroid) return "chrome-android";
  if (isChrome && !isAndroid && !isIOS) return "chrome-desktop";
  if (isSafari && isIOS) return "safari-ios";
  return "other";
}

type InstructionStep = { label: string; detail?: string };

function getInstructions(browser: BrowserKind, reason: RecoveryReason): InstructionStep[] {
  if (reason === "dismissed") {
    return [
      { label: "La popup de permission a été fermée." },
      { label: "Tu peux la rouvrir en appuyant sur \"Réessayer maintenant\" ci-dessous." },
    ];
  }

  // reason === 'denied'
  switch (browser) {
    case "chrome-android":
      return [
        { label: "Tape le 🔒 dans la barre d'adresse" },
        { label: "Appuie sur \"Permissions du site\"" },
        { label: "Trouve \"Microphone\" et passe à \"Autoriser\"" },
        { label: "Reviens ici et appuie sur \"J'ai réautorisé — Retester\"" },
      ];
    case "chrome-desktop":
      return [
        { label: "Clique sur 🔒 à gauche de l'URL" },
        { label: "Sélectionne \"Paramètres du site\"" },
        { label: "Passe \"Microphone\" sur \"Autoriser\"" },
        { label: "Reviens ici et clique sur \"J'ai réautorisé — Retester\"" },
      ];
    case "safari-ios":
      return [
        { label: "Ouvre Paramètres iOS" },
        { label: "Défile jusqu'à \"Safari\"" },
        { label: "Appuie sur \"Paramètres des sites web\" → \"Microphone\"" },
        { label: "Passe ce site sur \"Autoriser\"" },
        { label: "Reviens ici et appuie sur \"J'ai réautorisé — Retester\"" },
      ];
    default:
      return [
        { label: "Ouvre les paramètres de ton navigateur" },
        { label: "Trouve les permissions du site pour cette page" },
        { label: "Autorise l'accès au microphone" },
        { label: "Reviens ici et clique sur \"J'ai réautorisé — Retester\"" },
      ];
  }
}

export function MicPermissionRecoveryModal({
  isOpen,
  reason,
  onRetry,
  onRefresh,
  onDismiss,
}: MicPermissionRecoveryModalProps) {
  const titleId = useId();
  const browser = detectBrowser();
  const steps = getInstructions(browser, reason);

  if (!isOpen) return null;

  const isDismissed = reason === "dismissed";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(0,0,0,0.65)] px-4 pb-6 sm:items-center sm:pb-0"
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-2xl shadow-black/40"
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">
              {isDismissed ? "🎙️" : "🔒"}
            </span>
            <div>
              <h2 id={titleId} className="text-base font-black text-white">
                {isDismissed
                  ? "Permission non accordée"
                  : "Microphone bloqué"}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {isDismissed
                  ? "La popup a été fermée. Tu peux réessayer."
                  : "Autorise le micro dans les paramètres de ton navigateur."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fermer"
            className="shrink-0 rounded-lg p-1 text-gray-600 transition-colors hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Steps */}
        <ol className="mb-5 space-y-2">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300">
              {steps.length > 1 ? (
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-black text-gray-400">
                  {i + 1}
                </span>
              ) : (
                <span className="mt-0.5 text-gray-600">→</span>
              )}
              <span className="leading-snug">{step.label}</span>
            </li>
          ))}
        </ol>

        {/* CTA */}
        <div className="flex flex-col gap-2 sm:flex-row">
          {isDismissed ? (
            <button
              type="button"
              onClick={onRetry}
              className="flex-1 rounded-lg bg-purple-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500"
            >
              🎙️ Réessayer maintenant
            </button>
          ) : (
            <button
              type="button"
              onClick={onRefresh}
              className="flex-1 rounded-lg bg-purple-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500"
            >
              ✅ J&apos;ai réautorisé — Retester
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 rounded-lg bg-gray-700 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600"
          >
            Plus tard
          </button>
        </div>
      </section>
    </div>
  );
}

export default MicPermissionRecoveryModal;
