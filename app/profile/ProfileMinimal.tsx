"use client";

// Sprint 0.5 — minimal identity editor.
// No XP display, no level badge, no skin grid, no titles, no badges.
// Per spec §2.2: gamification = per-subject progression % on /student dashboard (Sprint 4).

import { useState } from "react";
import Link from "next/link";

// Avatar color swatches matching the Maïa design-system palette.
const AVATAR_COLORS = [
  "#f59e0b", // amber  (default)
  "#ef4444", // red
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#3b82f6", // blue
  "#06b6d4", // cyan
];

type IdentityProfile = {
  first_name: string;
  last_name: string;
  user_name: string;
  avatar_color: string;
};

export default function ProfileMinimal({
  initialProfile,
}: {
  initialProfile: IdentityProfile;
}) {
  const [profile, setProfile] = useState<IdentityProfile>(initialProfile);
  const [firstName, setFirstName] = useState(initialProfile.first_name);
  const [lastName, setLastName] = useState(initialProfile.last_name);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const hasChanges =
    firstName.trim() !== profile.first_name ||
    lastName.trim() !== profile.last_name;

  async function save(overrides?: Partial<IdentityProfile>) {
    setSaving(true);
    setMessage(null);
    setIsError(false);

    const payload: Record<string, string> = {};

    if (overrides?.avatar_color !== undefined) {
      payload.avatar_color = overrides.avatar_color;
    } else {
      if (firstName.trim()) payload.first_name = firstName.trim();
      if (lastName.trim()) payload.last_name = lastName.trim();
    }

    try {
      const res = await fetch("/api/profile/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json() as { profile?: Partial<IdentityProfile>; error?: string };

      if (!res.ok) {
        setIsError(true);
        setMessage(json.error ?? "Erreur lors de la sauvegarde.");
        return;
      }

      setProfile((prev) => ({ ...prev, ...json.profile }));

      if (overrides?.avatar_color !== undefined) {
        setProfile((prev) => ({ ...prev, avatar_color: overrides.avatar_color! }));
      } else {
        setProfile((prev) => ({
          ...prev,
          first_name: payload.first_name ?? prev.first_name,
          last_name: payload.last_name ?? prev.last_name,
        }));
      }

      setMessage("Profil mis à jour.");
    } catch {
      setIsError(true);
      setMessage("Impossible de contacter le serveur.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8">
      {/* Back nav */}
      <div className="mx-auto max-w-lg">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-2xl border border-gray-800 bg-gray-900 px-4 py-2 text-sm font-bold text-gray-300 transition hover:text-white"
        >
          ← Accueil
        </Link>
      </div>

      {/* Card */}
      <section className="mx-auto mt-6 max-w-lg rounded-3xl border border-gray-800 bg-gray-900 p-8 shadow-xl">
        <h1 className="text-2xl font-black text-white">Mon profil</h1>
        <p className="mt-1 text-sm text-gray-400">
          Modifie tes informations d&apos;identité.
        </p>

        {/* Avatar color picker */}
        <div className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">
            Couleur
          </h2>

          <div className="mt-3 flex flex-wrap gap-3">
            {AVATAR_COLORS.map((color) => {
              const selected = profile.avatar_color === color;
              return (
                <button
                  key={color}
                  type="button"
                  disabled={saving}
                  onClick={() => save({ avatar_color: color })}
                  className={`h-10 w-10 rounded-2xl border-4 transition ${
                    selected
                      ? "scale-110 border-white"
                      : "border-gray-800 hover:scale-105 hover:border-gray-600"
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Choisir la couleur ${color}`}
                />
              );
            })}
          </div>
        </div>

        {/* Identity fields */}
        <div className="mt-8 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">
            Identité
          </h2>

          <label className="block">
            <span className="text-sm font-semibold text-gray-300">Prénom</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={100}
              autoComplete="given-name"
              className="mt-1 w-full rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-600 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
              placeholder="Ton prénom"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-gray-300">Nom</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={100}
              autoComplete="family-name"
              className="mt-1 w-full rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-600 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
              placeholder="Ton nom"
            />
          </label>

          {/* user_name is auto-derived — display only */}
          {profile.user_name && (
            <div>
              <span className="text-sm font-semibold text-gray-300">
                Pseudo (généré)
              </span>
              <p className="mt-1 rounded-2xl border border-gray-700 bg-gray-800/50 px-4 py-3 text-sm text-gray-400">
                {profile.user_name}
              </p>
            </div>
          )}
        </div>

        {/* Status message */}
        {message && (
          <p
            className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
              isError
                ? "bg-red-900/30 text-red-400"
                : "bg-green-900/30 text-green-400"
            }`}
          >
            {message}
          </p>
        )}

        {/* Save button */}
        <button
          type="button"
          disabled={saving || !hasChanges}
          onClick={() => save()}
          className="mt-6 w-full rounded-2xl bg-amber-500 px-4 py-3 font-black text-white transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Sauvegarde…" : "Enregistrer"}
        </button>
      </section>
    </main>
  );
}
