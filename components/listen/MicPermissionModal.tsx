"use client";

import { useId, useState } from "react";
import type { MouseEvent } from "react";

/**
 * // Pre-permission micro :
 * // <MicPermissionModal
 * //   isOpen={showMicPermission}
 * //   onActivate={() => requestMicrophoneAccess()}
 * //   onDismiss={() => setShowMicPermission(false)}
 * // />
 */
export type MicPermissionModalProps = {
  isOpen: boolean;
  onActivate: () => void;
  onDismiss: () => void;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function MicPermissionModal({ isOpen, onActivate, onDismiss }: MicPermissionModalProps) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const helpId = useId();

  if (!isOpen) {
    return null;
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onDismiss();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex animate-[mic-backdrop-in_180ms_ease-out_both] items-center justify-center bg-[rgba(0,0,0,0.6)] px-4 py-6"
      onClick={handleBackdropClick}
    >
      <style jsx>{`
        @keyframes mic-backdrop-in {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        @keyframes mic-modal-in {
          from {
            opacity: 0;
            transform: translateY(12px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-lg animate-[mic-modal-in_220ms_ease-out_both] rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-2xl shadow-black/40 sm:p-6"
      >
        <div className="flex items-start gap-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-200"
            aria-hidden="true"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3.5a3 3 0 0 0-3 3v5a3 3 0 1 0 6 0v-5a3 3 0 0 0-3-3Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1M12 18v2.5M9 20.5h6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-semibold text-white">
              Schoolio a besoin de ton micro
            </h2>
            <p id={descriptionId} className="mt-3 text-sm leading-6 text-gray-300">
              Schoolio écoute ton cours pour te proposer en temps réel des questions adaptées à ce que tu expliques.
              L&apos;audio n&apos;est jamais enregistré ni transmis, seul le texte transcrit est utilisé pour générer
              des suggestions.
            </p>
            <p className="mt-3 text-xs text-gray-500">Tu peux désactiver l&apos;écoute à tout moment.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onActivate}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
          >
            Activer le micro
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-medium text-gray-100 transition-colors duration-150 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500/60"
          >
            Plus tard
          </button>
        </div>

        <div className="mt-5 border-t border-gray-800 pt-4">
          <button
            type="button"
            onClick={() => setIsHelpOpen((current) => !current)}
            aria-expanded={isHelpOpen}
            aria-controls={helpId}
            className="inline-flex w-full items-center justify-between gap-3 text-left text-sm font-medium text-purple-300 transition-colors duration-150 hover:text-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <span>Comment activer dans le navigateur ?</span>
            <span
              className={cx("text-xs transition-transform duration-150", isHelpOpen && "rotate-180")}
              aria-hidden="true"
            >
              ▼
            </span>
          </button>

          {isHelpOpen && (
            <div id={helpId} className="mt-4 space-y-3 rounded-xl border border-gray-800 bg-gray-950/60 p-4">
              <div>
                <p className="text-sm font-semibold text-gray-200">Chrome/Edge</p>
                <p className="mt-1 text-sm leading-5 text-gray-400">
                  Clique sur l&apos;icône cadenas ou réglages à gauche de l&apos;URL → Autoriser l&apos;accès au micro
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-200">Safari</p>
                <p className="mt-1 text-sm leading-5 text-gray-400">
                  Safari &gt; Préférences &gt; Sites web &gt; Microphone &gt; Schoolio → Autoriser
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-200">Firefox</p>
                <p className="mt-1 text-sm leading-5 text-gray-400">
                  Non supporté pour cette feature. Utilise Chrome/Edge.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default MicPermissionModal;
