"use client";

import { useId, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Label } from "@/components/ui/Label";
import type { MisconceptionRow } from "../types";

const MAX_MISCONCEPTIONS = 10;

/**
 * Liste éditable des misconceptions du concept (Sprint 2B PR B).
 *
 * UX :
 * - Liste ordonnée par `ordinal`
 * - Add inline form en bas (textarea + bouton)
 * - Edit inline par row (Pencil → mode édition)
 * - Delete avec ConfirmDialog (a11y déjà OK, existant)
 *
 * A11y :
 * - `<ol role="list">` sémantique
 * - Form errors `role="alert"`
 * - `<fieldset>` autour des contrôles edit/delete pour grouper
 * - Bouton "Ajouter" disabled + message visible quand 10 atteint
 */
export default function MisconceptionsList({
  conceptId,
  misconceptions,
  onAdd,
  onUpdate,
  onDelete,
  onError,
}: {
  conceptId: string;
  misconceptions: MisconceptionRow[];
  onAdd: (m: MisconceptionRow) => void;
  onUpdate: (m: MisconceptionRow) => void;
  onDelete: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [deletingMisconception, setDeletingMisconception] = useState<MisconceptionRow | null>(null);

  const newId = useId();
  const newErrorId = useId();
  const editErrorId = useId();

  const reachedMax = misconceptions.length >= MAX_MISCONCEPTIONS;

  async function add() {
    const trimmed = newLabel.trim();
    if (trimmed.length < 1 || trimmed.length > 300) {
      setNewError("Le libellé doit faire 1-300 caractères.");
      return;
    }
    setAdding(true);
    setNewError(null);
    try {
      const res = await fetch(`/api/curation/concept/${conceptId}/misconceptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        misconception?: MisconceptionRow;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.misconception) {
        onError(json.error ?? "Erreur lors de l'ajout");
        return;
      }
      onAdd(json.misconception);
      setNewLabel("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(m: MisconceptionRow) {
    setEditingId(m.id);
    setEditDraft(m.label);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
    setEditError(null);
  }

  async function saveEdit(m: MisconceptionRow) {
    const trimmed = editDraft.trim();
    if (trimmed.length < 1 || trimmed.length > 300) {
      setEditError("Le libellé doit faire 1-300 caractères.");
      return;
    }
    if (trimmed === m.label) {
      cancelEdit();
      return;
    }
    setSavingId(m.id);
    setEditError(null);
    try {
      const res = await fetch(
        `/api/curation/concept/${conceptId}/misconceptions/${m.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: trimmed }),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        misconception?: MisconceptionRow;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.misconception) {
        onError(json.error ?? "Erreur lors de la mise à jour");
        return;
      }
      onUpdate(json.misconception);
      cancelEdit();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setSavingId(null);
    }
  }

  async function confirmDelete(m: MisconceptionRow) {
    setSavingId(m.id);
    try {
      const res = await fetch(
        `/api/curation/concept/${conceptId}/misconceptions/${m.id}`,
        { method: "DELETE" },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        onError(json.error ?? "Erreur lors de la suppression");
        return;
      }
      onDelete(m.id);
      setDeletingMisconception(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <ol
        role="list"
        className="
          mb-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white
          dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900
        "
      >
        {misconceptions.length === 0 ? (
          <li className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Aucune misconception pour ce concept.{" "}
            <span className="block text-xs">
              Ajoute les erreurs conceptuelles classiques que tes élèves font.
            </span>
          </li>
        ) : (
          misconceptions.map((m) => {
            const isEditing = editingId === m.id;
            const isSaving = savingId === m.id;
            return (
              <li key={m.id} aria-busy={isSaving || undefined} className="p-4">
                {isEditing ? (
                  <div>
                    <Label htmlFor={`edit-${m.id}`} className="sr-only">
                      Libellé de la misconception {m.ordinal}
                    </Label>
                    <textarea
                      id={`edit-${m.id}`}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      maxLength={300}
                      rows={2}
                      aria-invalid={editError !== null}
                      aria-describedby={editError ? editErrorId : undefined}
                      disabled={isSaving}
                      className="
                        w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900
                        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1
                        focus:ring-offset-white
                        disabled:cursor-not-allowed disabled:opacity-60
                        aria-[invalid=true]:border-red-500
                        dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100
                        dark:focus:ring-offset-slate-900
                      "
                    />
                    {editError ? (
                      <p
                        id={editErrorId}
                        role="alert"
                        className="mt-1 text-xs font-medium text-red-600 dark:text-red-400"
                      >
                        {editError}
                      </p>
                    ) : null}
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={isSaving}
                        className="
                          inline-flex items-center gap-1.5 rounded-md px-2.5 py-1
                          text-xs font-medium text-slate-600
                          transition hover:bg-slate-100
                          focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-indigo-500 focus-visible:ring-offset-2
                          focus-visible:ring-offset-white
                          disabled:cursor-not-allowed disabled:opacity-60
                          dark:text-slate-400 dark:hover:bg-slate-800
                          dark:focus-visible:ring-offset-slate-900
                          motion-reduce:transition-none
                        "
                      >
                        <X size={12} strokeWidth={2} aria-hidden="true" />
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(m)}
                        disabled={isSaving}
                        className="
                          inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1
                          text-xs font-semibold text-white
                          transition hover:bg-indigo-700
                          focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-indigo-500 focus-visible:ring-offset-2
                          focus-visible:ring-offset-white
                          disabled:cursor-not-allowed disabled:opacity-60
                          dark:focus-visible:ring-offset-slate-900
                          motion-reduce:transition-none
                        "
                      >
                        <Check size={12} strokeWidth={2} aria-hidden="true" />
                        {isSaving ? "…" : "Enregistrer"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <span
                      className="
                        inline-flex h-6 w-6 shrink-0 items-center justify-center
                        rounded-full bg-slate-100 text-xs font-semibold text-slate-700
                        dark:bg-slate-800 dark:text-slate-300
                      "
                      aria-hidden="true"
                    >
                      {m.ordinal}
                    </span>
                    <p className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-300">
                      <span className="sr-only">Misconception {m.ordinal}&nbsp;: </span>
                      {m.label}
                    </p>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        disabled={isSaving}
                        aria-label={`Modifier la misconception ${m.ordinal}`}
                        className="
                          inline-flex h-7 w-7 items-center justify-center rounded-md
                          text-slate-500 transition
                          hover:bg-slate-100 hover:text-slate-900
                          focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-indigo-500 focus-visible:ring-offset-2
                          focus-visible:ring-offset-white
                          disabled:cursor-not-allowed disabled:opacity-60
                          dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200
                          dark:focus-visible:ring-offset-slate-900
                          motion-reduce:transition-none
                        "
                      >
                        <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingMisconception(m)}
                        disabled={isSaving}
                        aria-label={`Supprimer la misconception ${m.ordinal}`}
                        className="
                          inline-flex h-7 w-7 items-center justify-center rounded-md
                          text-slate-500 transition
                          hover:bg-red-100 hover:text-red-700
                          focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-red-500 focus-visible:ring-offset-2
                          focus-visible:ring-offset-white
                          disabled:cursor-not-allowed disabled:opacity-60
                          dark:text-slate-400 dark:hover:bg-red-950 dark:hover:text-red-400
                          dark:focus-visible:ring-offset-slate-900
                          motion-reduce:transition-none
                        "
                      >
                        <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })
        )}
      </ol>

      {/* Add form */}
      {reachedMax ? (
        <p className="text-xs italic text-slate-500 dark:text-slate-400">
          Maximum {MAX_MISCONCEPTIONS} misconceptions par concept atteint.
        </p>
      ) : (
        <div
          className="
            rounded-2xl border border-dashed border-slate-300 bg-white p-4
            dark:border-slate-700 dark:bg-slate-900
          "
        >
          <Label htmlFor={newId} className="mb-1.5 block">
            Ajouter une misconception
          </Label>
          <div className="flex items-start gap-2">
            <textarea
              id={newId}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Ex : Confusion entre masse et poids"
              aria-invalid={newError !== null}
              aria-describedby={newError ? newErrorId : undefined}
              disabled={adding}
              className="
                min-w-0 flex-1 rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900
                placeholder:text-slate-400
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1
                focus:ring-offset-white
                disabled:cursor-not-allowed disabled:opacity-60
                aria-[invalid=true]:border-red-500
                dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100
                dark:placeholder:text-slate-500
                dark:focus:ring-offset-slate-900
              "
            />
            <button
              type="button"
              onClick={add}
              disabled={adding || newLabel.trim().length === 0}
              className="
                inline-flex shrink-0 items-center gap-1.5 rounded-lg
                bg-indigo-600 px-3 py-2 text-sm font-semibold text-white
                transition hover:bg-indigo-700
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-indigo-500 focus-visible:ring-offset-2
                focus-visible:ring-offset-white
                disabled:cursor-not-allowed disabled:opacity-60
                dark:focus-visible:ring-offset-slate-900
                motion-reduce:transition-none
              "
            >
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              {adding ? "…" : "Ajouter"}
            </button>
          </div>
          {newError ? (
            <p
              id={newErrorId}
              role="alert"
              className="mt-1 text-xs font-medium text-red-600 dark:text-red-400"
            >
              {newError}
            </p>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        isOpen={deletingMisconception !== null}
        title="Supprimer cette misconception ?"
        description={
          deletingMisconception
            ? `« ${deletingMisconception.label} ». Cette action est irréversible.`
            : ""
        }
        variant="destructive"
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        icon={null}
        isLoading={savingId !== null && deletingMisconception?.id === savingId}
        onConfirm={() => (deletingMisconception ? confirmDelete(deletingMisconception) : undefined)}
        onCancel={() => setDeletingMisconception(null)}
      />
    </>
  );
}
