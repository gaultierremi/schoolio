"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { SUBJECTS, LEVELS } from "@/lib/subjects";

export default function NewClassPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [name, setName] = useState("");
  const [level, setLevel] = useState<string>("");
  const [subject, setSubject] = useState<string>("");
  const [authMode, setAuthMode] = useState<"full" | "light">("full");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setError("Le nom doit contenir entre 2 et 80 caractères.");
      return;
    }

    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/"); return; }

    const res = await fetch("/api/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmedName,
        level: level || null,
        subject: subject || null,
        auth_mode: authMode,
      }),
    });

    const json = await res.json() as { class?: { id: string }; error?: string };
    if (!res.ok || !json.class) {
      setError(json.error ?? "Erreur lors de la création.");
      setSubmitting(false);
      return;
    }

    router.push(`/school/classes/${json.class.id}`);
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-lg">

        {/* Header */}
        <a href="/school/classes" className="text-xs text-gray-500 hover:text-gray-400">
          ← Mes classes
        </a>
        <h1 className="mt-2 text-3xl font-black text-white">Nouvelle classe</h1>
        <p className="mt-1 text-sm text-gray-500">
          Un code d'invitation sera généré automatiquement.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">

          {/* Nom */}
          <div>
            <label className="block text-sm font-bold text-gray-200">
              Nom de la classe <span className="text-purple-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex : 3ème B — Chimie"
              maxLength={80}
              disabled={submitting}
              className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 disabled:opacity-50"
            />
          </div>

          {/* Niveau */}
          <div>
            <label className="block text-sm font-bold text-gray-200">Niveau</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              disabled={submitting}
              className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 disabled:opacity-50"
            >
              <option value="">Tous niveaux</option>
              {LEVELS.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* Matière */}
          <div>
            <label className="block text-sm font-bold text-gray-200">Matière</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={submitting}
              className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 disabled:opacity-50"
            >
              <option value="">Toutes matières</option>
              {SUBJECTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji} {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Auth mode */}
          <div>
            <label className="block text-sm font-bold text-gray-200">
              Mode d'authentification des élèves
            </label>
            <div className="mt-3 space-y-3">
              {(["full", "light"] as const).map((mode) => (
                <label
                  key={mode}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                    authMode === mode
                      ? "border-purple-500 bg-purple-500/10"
                      : "border-gray-700 bg-gray-900 hover:border-gray-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="auth_mode"
                    value={mode}
                    checked={authMode === mode}
                    onChange={() => setAuthMode(mode)}
                    className="mt-0.5 accent-purple-500"
                  />
                  <div>
                    <p className="font-bold text-white">
                      {mode === "full" ? "🔐 Compte complet" : "🔓 Pseudo seulement"}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {mode === "full"
                        ? "L'élève crée un compte avec email et mot de passe. Recommandé pour un suivi individuel."
                        : "L'élève choisit juste un pseudo. Idéal pour une séance rapide ou des jeunes élèves."}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-500 px-5 py-3.5 font-black text-gray-950 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-950/30 border-t-gray-950" />
                Création...
              </>
            ) : (
              "Créer la classe"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
