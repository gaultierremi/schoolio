"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function OnboardingNameClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const f = firstName.trim();
    const l = lastName.trim();
    if (f.length < 1) { setError("Ton prénom est requis."); return; }
    if (l.length < 1) { setError("Ton nom est requis."); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/profile/name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: f, last_name: l }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Erreur, réessaie.");
        setSaving(false);
        return;
      }
      // Destination : ?next= (e.g. /join?code=ABC123) ou par défaut /student
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
            Dis-nous qui tu es
          </h1>
          <p className="text-sm text-[rgb(var(--ink-2))] text-center">
            Maïa utilisera ton prénom dans tes devoirs et messages.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="onboarding-firstname"
              className="mb-1 block text-xs font-bold text-[rgb(var(--ink-2))]"
            >
              Prénom <span className="text-[rgb(var(--red))]">*</span>
            </label>
            <input
              id="onboarding-firstname"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Ex : Mathéo"
              maxLength={80}
              autoFocus
              autoComplete="given-name"
              disabled={saving}
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--ink))] outline-none transition focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/30 disabled:opacity-50"
            />
          </div>
          <div>
            <label
              htmlFor="onboarding-lastname"
              className="mb-1 block text-xs font-bold text-[rgb(var(--ink-2))]"
            >
              Nom <span className="text-[rgb(var(--red))]">*</span>
            </label>
            <input
              id="onboarding-lastname"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Ex : Dupont"
              maxLength={80}
              autoComplete="family-name"
              disabled={saving}
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--ink))] outline-none transition focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/30 disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/10 p-3 text-sm font-bold text-[rgb(var(--red))]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-[rgb(var(--accent))] py-3.5 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Continuer →"}
          </button>
        </form>
      </section>
    </main>
  );
}
