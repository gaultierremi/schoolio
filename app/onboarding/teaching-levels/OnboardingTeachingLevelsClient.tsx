"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const LEVELS = [
  { id: 1, label: "1ère secondaire" },
  { id: 2, label: "2ème secondaire" },
  { id: 3, label: "3ème secondaire" },
  { id: 4, label: "4ème secondaire" },
  { id: 5, label: "5ème secondaire" },
  { id: 6, label: "6ème secondaire" },
];

type Props = { academicYear: string };

export default function OnboardingTeachingLevelsClient({ academicYear }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(level: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (selected.size === 0) {
      setError("Sélectionne au moins un niveau.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile/teaching-levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taught_levels: Array.from(selected) }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Erreur, réessaie.");
        setSaving(false);
        return;
      }
      const destination = nextParam && nextParam.startsWith("/") ? nextParam : "/accueil";
      router.push(destination);
    } catch {
      setError("Connexion impossible, réessaie.");
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--surface-2))] px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[rgb(var(--accent))] text-white text-2xl font-black select-none">
            M
          </div>
          <h1 className="serif text-2xl font-bold text-[rgb(var(--ink))]">
            Tes niveaux cette année
          </h1>
          <p className="text-sm text-[rgb(var(--ink-2))] text-center">
            Année académique <span className="font-bold text-[rgb(var(--ink))]">{academicYear}</span> ·
            coche les niveaux où tu interviens. Tu pourras créer des classes uniquement dans ces niveaux.
            Réinitialisé à chaque rentrée.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div className="space-y-2">
            {LEVELS.map((lvl) => {
              const isSelected = selected.has(lvl.id);
              return (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => toggle(lvl.id)}
                  disabled={saving}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-bold transition ${
                    isSelected
                      ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]"
                      : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-2))] hover:border-[rgb(var(--ink-3))]"
                  } disabled:opacity-50`}
                >
                  <span>{lvl.label}</span>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded border ${
                      isSelected
                        ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-white"
                        : "border-[rgb(var(--border))]"
                    }`}
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="rounded-xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/10 p-3 text-sm font-bold text-[rgb(var(--red))]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || selected.size === 0}
            className="w-full rounded-2xl bg-[rgb(var(--accent))] py-3.5 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Confirmer →"}
          </button>
        </form>
      </section>
    </main>
  );
}
