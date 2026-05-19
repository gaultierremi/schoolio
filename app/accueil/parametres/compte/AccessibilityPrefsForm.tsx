"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Sprint 6 PR S6-8 — Form de préférences accessibilité.
 *
 * Pour l'instant : un seul switch "Police adaptée à la dyslexie" (OpenDyslexic).
 * Le state local est optimistic + rollback en cas d'erreur API.
 *
 * Le router.refresh() après save force le re-render du layout qui re-fetche
 * et passe la nouvelle pref à AccessibilityProvider → font appliquée
 * instantanément.
 *
 * A11y : checkbox semantic avec label cliquable (htmlFor),
 * aria-describedby pour la note, focus-visible AA.
 */
export default function AccessibilityPrefsForm({
  initialPrefersDyslexicFont,
}: {
  initialPrefersDyslexicFont: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(initialPrefersDyslexicFont);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    const previous = checked;
    setChecked(next); // optimistic
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefers_dyslexic_font: next }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setChecked(previous); // rollback
        setError(json.error ?? "Erreur lors de la sauvegarde");
        return;
      }
      // Refresh layout pour appliquer la font via AccessibilityProvider
      router.refresh();
    } catch (err) {
      setChecked(previous); // rollback
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <label
        htmlFor="prefers-dyslexic"
        className="flex cursor-pointer items-start gap-3"
      >
        <input
          id="prefers-dyslexic"
          type="checkbox"
          checked={checked}
          onChange={(e) => toggle(e.target.checked)}
          disabled={saving}
          aria-describedby="prefers-dyslexic-note"
          className="
            mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300
            text-indigo-600
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-white
            disabled:cursor-not-allowed disabled:opacity-50
            dark:border-slate-700 dark:bg-slate-950
            dark:focus-visible:ring-offset-slate-900
          "
        />
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Police adaptée à la dyslexie (OpenDyslexic)
          </p>
          <p
            id="prefers-dyslexic-note"
            className="mt-1 text-xs text-slate-500 dark:text-slate-400"
          >
            Active une police aux caractères plus différenciés, conçue pour
            réduire la fatigue de lecture en cas de dyslexie. S&apos;applique à
            toutes les pages Maïa une fois activée.
          </p>
        </div>
        {saving ? (
          <Loader2
            size={14}
            strokeWidth={2}
            aria-hidden="true"
            className="mt-1 animate-spin text-slate-400 motion-reduce:animate-none"
          />
        ) : null}
      </label>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
