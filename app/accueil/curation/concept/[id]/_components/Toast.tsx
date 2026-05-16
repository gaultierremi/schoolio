"use client";

import { useEffect } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

/**
 * Toast a11y (Sprint 2B PR B).
 *
 * A11y :
 * - `role="status"` (success) ou `role="alert"` (error) pour annoncer aux SR
 * - `aria-live="polite"` (success) ou `aria-live="assertive"` (error)
 * - Auto-dismiss après 4s (errors) / 3s (success)
 * - Bouton close avec `aria-label`
 * - Position bottom-center, animation fade-in respectant motion-reduce
 */
export default function Toast({
  toast,
  onClose,
}: {
  toast: { message: string; tone: "success" | "error" } | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const delay = toast.tone === "error" ? 4500 : 3000;
    const timer = window.setTimeout(onClose, delay);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const isError = toast.tone === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className="
        fixed bottom-6 left-1/2 z-50 -translate-x-1/2
        animate-fade-in motion-reduce:animate-none
      "
    >
      <div
        className={`
          inline-flex items-center gap-2 rounded-xl px-4 py-2.5 shadow-lg
          text-sm font-medium
          ${
            isError
              ? "bg-red-600 text-white dark:bg-red-700"
              : "bg-emerald-600 text-white dark:bg-emerald-700"
          }
        `}
      >
        {isError ? (
          <XCircle size={16} strokeWidth={2} aria-hidden="true" />
        ) : (
          <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
        )}
        <span>{toast.message}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la notification"
          className="
            ml-2 rounded-md p-0.5 transition hover:bg-white/20
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-white/50
            motion-reduce:transition-none
          "
        >
          <X size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
