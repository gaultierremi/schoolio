"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "pending" | "approved" | "error";

type Props = { initialStatus: "none" | "pending" | "approved" | "rejected" };

export default function RequestForm({ initialStatus }: Props) {
  const [status, setStatus] = useState<Status>(
    initialStatus === "pending" ? "pending" : initialStatus === "approved" ? "approved" : "idle",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError("");

    try {
      const res = await fetch("/api/beta/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() || undefined }),
      });

      const data = (await res.json()) as {
        already_approved?: boolean;
        already_pending?: boolean;
        ok?: boolean;
        error?: string;
      };

      if (data.already_approved) { setStatus("approved"); return; }
      if (data.already_pending || data.ok) { setStatus("pending"); return; }
      setError(data.error ?? "Erreur inconnue");
      setStatus("idle");
    } catch {
      setError("Erreur réseau, réessaie.");
      setStatus("idle");
    }
  }

  if (status === "approved") {
    return (
      <div className="rounded-2xl border border-green-700/40 bg-green-950/30 px-5 py-4 text-center">
        <p className="text-2xl">🎉</p>
        <p className="mt-2 font-bold text-green-400">Ton accès est activé !</p>
        <p className="mt-1 text-sm text-green-300/70">Recharge la page pour accéder à Schoolio.</p>
        <button
          onClick={() => (window.location.href = "/")}
          className="mt-4 rounded-xl bg-green-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-green-600"
        >
          Accéder à Schoolio →
        </button>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="rounded-2xl border border-purple-800/40 bg-purple-950/20 px-5 py-4 text-center">
        <p className="text-2xl">⏳</p>
        <p className="mt-2 font-bold text-purple-300">Demande envoyée</p>
        <p className="mt-1 text-sm text-zinc-400">
          Ta demande est en cours d&apos;examen — tu seras notifié dès qu&apos;elle est validée.
        </p>
      </div>
    );
  }

  if (initialStatus === "rejected") {
    return (
      <div className="rounded-2xl border border-red-800/40 bg-red-950/20 px-5 py-4 text-center">
        <p className="text-sm text-red-400">
          Ta demande précédente n&apos;a pas été retenue. Tu peux en soumettre une nouvelle.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
          Pourquoi veux-tu rejoindre Schoolio ? <span className="text-zinc-600">(optionnel)</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Je suis prof de maths et..."
          className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-xl bg-purple-600 py-3 text-sm font-bold text-white transition hover:bg-purple-500 disabled:opacity-60"
      >
        {status === "submitting" ? "Envoi…" : "Envoyer ma demande"}
      </button>
    </form>
  );
}
