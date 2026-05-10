"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type WhitelistEntry = {
  id: string;
  email: string;
  added_at: string;
  source: string;
  notes: string | null;
};

type PendingRequest = {
  id: string;
  email: string;
  full_name: string | null;
  message: string | null;
  requested_at: string;
  status: string;
};

type HistoryEntry = PendingRequest & { reviewed_at: string | null };

type Props = {
  whitelist: WhitelistEntry[];
  pendingRequests: PendingRequest[];
  history: HistoryEntry[];
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function AddEmailModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/beta-whitelist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, notes: notes.trim() || undefined }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setLoading(false);
    if (data.ok) { onAdded(); onClose(); return; }
    setError(data.error ?? "Erreur");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="font-bold text-white">Ajouter un email</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            type="email"
            required
            placeholder="email@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
          />
          <textarea
            placeholder="Notes (optionnel)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-bold text-zinc-400 hover:text-white"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-60"
            >
              {loading ? "…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BetaAdminClient({ whitelist: initialWhitelist, pendingRequests: initialPending, history: initialHistory }: Props) {
  const router = useRouter();
  const [whitelist, setWhitelist] = useState(initialWhitelist);
  const [pending, setPending] = useState(initialPending);
  const [history, setHistory] = useState(initialHistory);
  const [showModal, setShowModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<string | null>(null);

  const refresh = useCallback(() => router.refresh(), [router]);

  async function handleApprove(reqId: string, email: string) {
    setLoadingId(reqId);
    const res = await fetch(`/api/admin/beta-whitelist/approve/${reqId}`, { method: "POST" });
    if (res.ok) {
      setPending((p) => p.filter((r) => r.id !== reqId));
      setWhitelist((w) => [
        { id: reqId, email, added_at: new Date().toISOString(), source: "approved_request", notes: null },
        ...w,
      ]);
    }
    setLoadingId(null);
  }

  async function handleReject(reqId: string) {
    setLoadingId(reqId);
    const res = await fetch(`/api/admin/beta-whitelist/reject/${reqId}`, { method: "POST" });
    if (res.ok) {
      const entry = pending.find((r) => r.id === reqId);
      setPending((p) => p.filter((r) => r.id !== reqId));
      if (entry) {
        setHistory((h) => [{ ...entry, status: "rejected", reviewed_at: new Date().toISOString() }, ...h]);
      }
    }
    setLoadingId(null);
    setConfirmReject(null);
  }

  async function handleRemove(id: string) {
    setLoadingId(id);
    const res = await fetch(`/api/admin/beta-whitelist/${id}`, { method: "DELETE" });
    if (res.ok) setWhitelist((w) => w.filter((e) => e.id !== id));
    setLoadingId(null);
    setConfirmRemove(null);
  }

  const filteredWhitelist = searchQuery
    ? whitelist.filter((e) => e.email.toLowerCase().includes(searchQuery.toLowerCase()))
    : whitelist;

  return (
    <div className="space-y-8">

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Whitelistés", value: whitelist.length, color: "text-green-400" },
          { label: "En attente", value: pending.length, color: "text-amber-400" },
          { label: "Traités", value: history.length, color: "text-zinc-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-center">
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-zinc-500">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Demandes en attente ── */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-amber-400">
          ⏳ Demandes en attente
          {pending.length > 0 && (
            <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-black text-amber-300">
              {pending.length}
            </span>
          )}
        </h2>

        {pending.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucune demande en attente 🎉</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-amber-800/30 bg-amber-950/10 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">{r.email}</p>
                    {r.full_name && (
                      <p className="text-xs text-zinc-400">{r.full_name}</p>
                    )}
                    {r.message && (
                      <p className="mt-1.5 text-sm italic text-zinc-400">
                        &ldquo;{r.message}&rdquo;
                      </p>
                    )}
                    <p className="mt-1 text-xs text-zinc-600">{relativeTime(r.requested_at)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => handleApprove(r.id, r.email)}
                      disabled={loadingId === r.id}
                      className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-600 disabled:opacity-60"
                    >
                      {loadingId === r.id ? "…" : "✅ Approuver"}
                    </button>
                    <button
                      onClick={() => setConfirmReject(r.id)}
                      disabled={loadingId === r.id}
                      className="rounded-lg border border-red-800/50 px-3 py-1.5 text-xs font-bold text-red-400 hover:border-red-600 disabled:opacity-60"
                    >
                      ❌ Rejeter
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Whitelist actuelle ── */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-purple-400">
            ✅ Whitelist actuelle ({whitelist.length})
          </h2>
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-600"
          >
            + Ajouter
          </button>
        </div>

        <input
          type="text"
          placeholder="Rechercher un email…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mb-3 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
        />

        <ul className="space-y-1.5">
          {filteredWhitelist.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{e.email}</p>
                <p className="text-xs text-zinc-600">
                  {e.source} · {relativeTime(e.added_at)}
                  {e.notes ? ` · ${e.notes}` : ""}
                </p>
              </div>
              {confirmRemove === e.id ? (
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => handleRemove(e.id)}
                    disabled={loadingId === e.id}
                    className="rounded-lg bg-red-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60"
                  >
                    Confirmer
                  </button>
                  <button
                    onClick={() => setConfirmRemove(null)}
                    className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmRemove(e.id)}
                  className="shrink-0 text-xs text-zinc-600 hover:text-red-400"
                >
                  🗑
                </button>
              )}
            </li>
          ))}
          {filteredWhitelist.length === 0 && (
            <li className="py-4 text-center text-sm text-zinc-600">Aucun résultat</li>
          )}
        </ul>
      </section>

      {/* ── Historique ── */}
      <section>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
        >
          {showHistory ? "▾" : "▸"} Historique des demandes ({history.length})
        </button>

        {showHistory && (
          <ul className="space-y-1.5">
            {history.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{r.email}</p>
                  <p className="text-xs text-zinc-600">
                    {r.reviewed_at ? relativeTime(r.reviewed_at) : "—"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                    r.status === "approved"
                      ? "bg-green-900/50 text-green-400"
                      : "bg-red-900/50 text-red-400"
                  }`}
                >
                  {r.status === "approved" ? "Approuvé" : "Rejeté"}
                </span>
              </li>
            ))}
            {history.length === 0 && (
              <li className="py-4 text-center text-sm text-zinc-600">Aucun historique</li>
            )}
          </ul>
        )}
      </section>

      {/* ── Modals ── */}
      {showModal && (
        <AddEmailModal onClose={() => setShowModal(false)} onAdded={refresh} />
      )}

      {confirmReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h3 className="font-bold text-white">Rejeter cette demande ?</h3>
            <p className="mt-2 text-sm text-zinc-400">
              L&apos;utilisateur pourra soumettre une nouvelle demande après 30 jours.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirmReject(null)}
                className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-bold text-zinc-400 hover:text-white"
              >
                Annuler
              </button>
              <button
                onClick={() => handleReject(confirmReject)}
                disabled={!!loadingId}
                className="flex-1 rounded-xl bg-red-700 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-60"
              >
                Rejeter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
