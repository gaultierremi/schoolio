"use client";

import { useState } from "react";

/**
 * Slider on/off "Active" pour une question validée (Sprint 2A).
 *
 * Mémoire `project_curation_concept_view` : la curation s'oriente vers un
 * simple toggle on/off au lieu du multi-état dérivé (validated_at / rejected_at).
 *
 * UX : switch visuel iOS-like, optimistic update, fallback si erreur API.
 * Position : dans la zone d'actions droite des cards de curation.
 */
export function IsActiveToggle({
  questionId,
  isActive,
  onToggled,
}: {
  questionId: string;
  isActive: boolean;
  /** Callback appelé avec la nouvelle valeur après confirmation serveur. */
  onToggled?: (nextValue: boolean) => void;
}) {
  const [optimistic, setOptimistic] = useState(isActive);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (pending) return;
    const nextValue = !optimistic;
    setOptimistic(nextValue);
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/curation/${questionId}/toggle-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextValue }),
      });
      const data = (await res.json()) as { ok?: boolean; is_active?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setOptimistic(!nextValue); // rollback
        setError(data.error ?? "Erreur");
        setPending(false);
        return;
      }
      if (onToggled) onToggled(nextValue);
      setPending(false);
    } catch {
      setOptimistic(!nextValue); // rollback
      setError("Erreur réseau");
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={optimistic}
        aria-label={optimistic ? "Désactiver cette question" : "Activer cette question"}
        onClick={handleClick}
        disabled={pending}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
          optimistic
            ? "bg-emerald-500"
            : "bg-slate-300 dark:bg-slate-700"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            optimistic ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className={`text-xs font-medium ${optimistic ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
        {optimistic ? "Active" : "Inactive"}
      </span>
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
