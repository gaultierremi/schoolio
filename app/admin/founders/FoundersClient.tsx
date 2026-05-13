"use client";

import { useState } from "react";
import { Plus, Trash2, Mail, ShieldCheck } from "lucide-react";
import type { FounderTeacher } from "@/lib/founders";

type Props = {
  initialFounders: FounderTeacher[];
  currentUserId: string;
};

export default function FoundersClient({ initialFounders, currentUserId }: Props) {
  const [founders, setFounders] = useState<FounderTeacher[]>(initialFounders);
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Email invalide.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/admin/founders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmedEmail, notes: notes.trim() || undefined }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Erreur lors de l'ajout.");
      setSubmitting(false);
      return;
    }
    // optimistic add
    setFounders((prev) => [
      ...prev,
      {
        email: trimmedEmail,
        added_by: currentUserId,
        added_at: new Date().toISOString(),
        notes: notes.trim() || null,
      },
    ]);
    setEmail("");
    setNotes("");
    setSubmitting(false);
  }

  async function handleRemove(emailToRemove: string) {
    if (!confirm(`Supprimer ${emailToRemove} de la liste des founders teachers ?`)) return;
    const res = await fetch(
      `/api/admin/founders/${encodeURIComponent(emailToRemove)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? "Erreur lors de la suppression.");
      return;
    }
    setFounders((prev) => prev.filter((f) => f.email !== emailToRemove));
  }

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-[rgb(var(--accent))]" />
          <h1 className="serif text-2xl font-bold text-[rgb(var(--ink))]">
            Founder Teachers
          </h1>
        </div>

        <p className="mb-6 text-sm text-[rgb(var(--ink-2))]">
          Emails dans cette liste reçoivent{" "}
          <code className="rounded bg-[rgb(var(--surface-3))] px-1 py-0.5 text-xs">
            role=&quot;teacher&quot;
          </code>{" "}
          au premier login. Tous les autres = student. Scopé à FounderTestGround.
        </p>

        {/* Add form */}
        <form
          onSubmit={handleAdd}
          className="mb-8 rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5"
        >
          <label className="block text-xs font-bold uppercase tracking-wider text-[rgb(var(--ink-2))]">
            Ajouter un founder
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              maxLength={254}
              className="flex-1 rounded-2xl border border-[rgb(var(--border))] bg-white px-4 py-2.5 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/20"
            />
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optionnel)"
              maxLength={200}
              className="flex-1 rounded-2xl border border-[rgb(var(--border))] bg-white px-4 py-2.5 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/20"
            />
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center justify-center gap-2 rounded-2xl bg-[rgb(var(--accent))] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[rgb(var(--accent-2))] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </button>
          </div>
          {error && (
            <p className="mt-3 rounded-2xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/5 p-2 text-xs text-[rgb(var(--red))]">
              {error}
            </p>
          )}
        </form>

        {/* List */}
        {founders.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-12 text-center">
            <Mail className="mx-auto h-8 w-8 text-[rgb(var(--ink-3))]" />
            <p className="mt-3 text-sm text-[rgb(var(--ink-2))]">
              Aucun founder teacher pour l&apos;instant.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {founders.map((f) => (
              <li
                key={f.email}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[rgb(var(--ink))]">{f.email}</p>
                  <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">
                    Ajouté le {new Date(f.added_at).toLocaleDateString("fr-BE")}
                    {f.notes && <> · {f.notes}</>}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(f.email)}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-2))] transition hover:border-[rgb(var(--red))] hover:text-[rgb(var(--red))]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
