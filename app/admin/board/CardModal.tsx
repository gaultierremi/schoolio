"use client";

import { useEffect, useState } from "react";
import type {
  BoardCard,
  BoardCardPriority,
  BoardCardStatus,
  BoardCardType,
} from "@/lib/discord-notifications";
import { ADMIN_EMAILS } from "@/lib/admin-config";

const inputCls =
  "w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500 transition-colors";
const labelCls =
  "block text-xs font-medium text-white/40 uppercase tracking-wider mb-1.5";
const selectCls =
  "w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors";

type Props = {
  mode: "create" | "edit";
  card?: BoardCard;
  defaultStatus?: BoardCardStatus;
  onClose: () => void;
  onCreated: (card: BoardCard) => void;
  onUpdated: (card: BoardCard) => void;
  onDeleted: (cardId: string) => void;
};

export function CardModal({
  mode,
  card,
  defaultStatus,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
}: Props) {
  const [type, setType] = useState<BoardCardType>(card?.type ?? "task");
  const [title, setTitle] = useState(card?.title ?? "");
  const [description, setDescription] = useState(card?.description ?? "");
  const [priority, setPriority] = useState<BoardCardPriority>(card?.priority ?? "medium");
  const [status, setStatus] = useState<BoardCardStatus>(
    card?.status ?? defaultStatus ?? "backlog"
  );
  const [assignedTo, setAssignedTo] = useState(card?.assigned_to ?? "");
  const [tags, setTags] = useState((card?.tags ?? []).join(", "));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit() {
    if (!title.trim()) {
      setError("Le titre est requis");
      return;
    }
    setLoading(true);
    setError(null);

    const parsedTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const body = {
      type,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status,
      assigned_to: assignedTo || null,
      tags: parsedTags,
    };

    try {
      if (mode === "create") {
        const res = await fetch("/api/admin/board", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { card?: BoardCard; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Erreur serveur");
        onCreated(data.card!);
        onClose();
      } else {
        const res = await fetch(`/api/admin/board/${card!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { card?: BoardCard; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Erreur serveur");
        onUpdated(data.card!);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive() {
    if (!card) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/board/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      const data = (await res.json()) as { card?: BoardCard; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erreur serveur");
      onUpdated(data.card!);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!card) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/board/${card.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erreur serveur");
      }
      onDeleted(card.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-gray-900 border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-bold text-white">
            {mode === "create" ? "Nouvelle carte" : "Modifier la carte"}
          </h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white text-2xl leading-none transition-colors w-8 h-8 flex items-center justify-center"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">

          {/* Type + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as BoardCardType)} className={selectCls}>
                <option value="task">✅ Tâche</option>
                <option value="bug">🐛 Bug</option>
                <option value="feature">✨ Feature</option>
                <option value="idea">💡 Idée</option>
                <option value="comment">💬 Note</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Priorité</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as BoardCardPriority)} className={selectCls}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">⚠ Critical</option>
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className={labelCls}>Titre *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Titre de la carte…"
              className={inputCls}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Description optionnelle…"
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Status — edit mode only */}
          {mode === "edit" && (
            <div>
              <label className={labelCls}>Statut</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as BoardCardStatus)} className={selectCls}>
                <option value="backlog">Backlog</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </div>
          )}

          {/* Assigned to */}
          <div>
            <label className={labelCls}>Assigné à</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={selectCls}>
              <option value="">Non assigné</option>
              {ADMIN_EMAILS.map((email) => (
                <option key={email} value={email}>{email.split("@")[0]}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className={labelCls}>Tags</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="ux, backend, urgent…"
              className={inputCls}
            />
            <p className="text-xs text-white/20 mt-1">Séparés par des virgules</p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0 space-y-3">

          {/* Archive + Delete (edit mode) */}
          {mode === "edit" && !confirmDelete && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleArchive}
                disabled={loading}
                className="flex-1 px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-sm font-medium transition-colors disabled:opacity-50"
              >
                📦 Archiver
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={loading}
                className="flex-1 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium transition-colors disabled:opacity-50"
              >
                🗑 Supprimer
              </button>
            </div>
          )}

          {/* Delete confirmation */}
          {confirmDelete && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
              <p className="text-xs text-red-300 flex-1">Supprimer définitivement ?</p>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-white/50 hover:text-white transition-colors px-2 py-1"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="text-xs px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50"
              >
                Confirmer
              </button>
            </div>
          )}

          {/* Submit / Cancel */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-white/50 hover:text-white text-sm font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !title.trim()}
              className="flex-1 px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "…" : mode === "create" ? "Créer la carte" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
