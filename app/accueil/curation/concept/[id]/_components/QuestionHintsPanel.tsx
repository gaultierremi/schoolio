"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleOff,
  Edit2,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { HINT_KINDS, type HintKind } from "@/lib/curation/validation";
import type { MisconceptionRow } from "../types";

/**
 * Sprint 5 PR S5-2 — Panel CRUD hints pour une question (expand inline depuis
 * QuestionsList).
 *
 * UX :
 * - Lazy fetch des hints quand l'expand s'ouvre (évite N requêtes à l'ouverture
 *   de la page concept)
 * - Liste hints existants triés par ordinal (1-5)
 * - Add inline (form vide en bas), edit inline (row pivot), delete avec confirm
 * - Toggle publish/brouillon via bouton dédié (approved_at)
 *
 * Hints liés à misconceptions : dropdown optionnel (NULL = pas attaché).
 * Cohérence : on ne propose que les misconceptions du concept de la question.
 *
 * A11y :
 * - `<form>` semantic + label/textarea/select avec id/htmlFor
 * - aria-busy pendant fetch/save
 * - role="alert" sur erreurs
 * - focus-visible AA, motion-reduce
 */

type Hint = {
  id: string;
  ordinal: number;
  template: string;
  kind: string;
  misconception_id: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

const KIND_LABELS: Record<HintKind, string> = {
  validation: "Validation (renforcement positif)",
  guided_question: "Question guidée (méthode socratique)",
  encouragement: "Encouragement",
  strong_hint: "Indice fort (dernier recours)",
};

const ORDINAL_LABELS = ["Indice 1 (doux)", "Indice 2", "Indice 3", "Indice 4", "Indice 5 (fort)"];

export default function QuestionHintsPanel({
  questionId,
  misconceptions,
  onToast,
}: {
  questionId: string;
  misconceptions: MisconceptionRow[];
  onToast: (message: string, tone: "success" | "error") => void;
}) {
  const [hints, setHints] = useState<Hint[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [savingId, setSavingId] = useState<string | "new" | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/curation/question/${questionId}/hints`);
        const json = (await res.json()) as
          | { ok: true; hints: Hint[] }
          | { ok: false; error: string };
        if (cancelled) return;
        if (!res.ok || !("ok" in json) || !json.ok) {
          setLoadError("error" in json ? json.error : "Erreur de chargement");
          return;
        }
        setHints(json.hints);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Erreur réseau");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  async function handleCreate(form: HintFormState) {
    setSavingId("new");
    try {
      const res = await fetch(`/api/curation/question/${questionId}/hints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: form.template,
          ordinal: form.ordinal,
          kind: form.kind,
          misconception_id: form.misconceptionId,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; hint?: Hint; error?: string };
      if (!res.ok || !json.ok || !json.hint) {
        onToast(json.error ?? "Erreur lors de la création", "error");
        return;
      }
      setHints((prev) =>
        [...(prev ?? []), json.hint!].sort((a, b) => a.ordinal - b.ordinal),
      );
      setEditingId(null);
      onToast("Indice créé (en brouillon)", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Erreur réseau", "error");
    } finally {
      setSavingId(null);
    }
  }

  async function handleUpdate(hintId: string, patch: Partial<HintFormState> & { approved?: boolean }) {
    setSavingId(hintId);
    try {
      const body: Record<string, unknown> = {};
      if (patch.template !== undefined) body.template = patch.template;
      if (patch.ordinal !== undefined) body.ordinal = patch.ordinal;
      if (patch.kind !== undefined) body.kind = patch.kind;
      if (patch.misconceptionId !== undefined) body.misconception_id = patch.misconceptionId;
      if (patch.approved !== undefined) body.approved = patch.approved;

      const res = await fetch(`/api/curation/hints/${hintId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; hint?: Hint; error?: string };
      if (!res.ok || !json.ok || !json.hint) {
        onToast(json.error ?? "Erreur lors de la mise à jour", "error");
        return;
      }
      setHints((prev) =>
        (prev ?? [])
          .map((h) => (h.id === hintId ? json.hint! : h))
          .sort((a, b) => a.ordinal - b.ordinal),
      );
      setEditingId(null);
      onToast(
        patch.approved === true
          ? "Indice publié"
          : patch.approved === false
            ? "Indice remis en brouillon"
            : "Indice mis à jour",
        "success",
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Erreur réseau", "error");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(hintId: string) {
    setSavingId(hintId);
    try {
      const res = await fetch(`/api/curation/hints/${hintId}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        onToast(json.error ?? "Erreur lors de la suppression", "error");
        return;
      }
      setHints((prev) => (prev ?? []).filter((h) => h.id !== hintId));
      onToast("Indice supprimé", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Erreur réseau", "error");
    } finally {
      setSavingId(null);
      setDeleteId(null);
    }
  }

  if (loadError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      >
        Impossible de charger les indices : {loadError}
      </div>
    );
  }

  if (hints === null) {
    return (
      <div
        aria-busy="true"
        className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-400"
      >
        <Loader2
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none"
        />
        Chargement des indices…
      </div>
    );
  }

  // Suggère un ordinal libre pour le nouveau hint (1-5, premier disponible)
  const usedOrdinals = new Set(hints.map((h) => h.ordinal));
  const suggestedOrdinal = [1, 2, 3, 4, 5].find((n) => !usedOrdinals.has(n)) ?? 1;

  return (
    <div className="space-y-2">
      {hints.length === 0 && editingId !== "new" ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-400">
          Aucun indice pour cette question. Ajoute-en jusqu&apos;à 5 (doux → fort).
        </p>
      ) : null}

      <ul role="list" className="space-y-2">
        {hints.map((hint) =>
          editingId === hint.id ? (
            <HintFormRow
              key={hint.id}
              initial={hint}
              misconceptions={misconceptions}
              saving={savingId === hint.id}
              onSubmit={(form) => handleUpdate(hint.id, form)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <HintViewRow
              key={hint.id}
              hint={hint}
              misconceptions={misconceptions}
              busy={savingId === hint.id}
              onEdit={() => setEditingId(hint.id)}
              onDelete={() => setDeleteId(hint.id)}
              onTogglePublish={() =>
                handleUpdate(hint.id, { approved: hint.approved_at === null })
              }
            />
          ),
        )}
      </ul>

      {editingId === "new" ? (
        <HintFormRow
          initial={null}
          suggestedOrdinal={suggestedOrdinal}
          misconceptions={misconceptions}
          saving={savingId === "new"}
          onSubmit={handleCreate}
          onCancel={() => setEditingId(null)}
        />
      ) : hints.length < 5 ? (
        <button
          type="button"
          onClick={() => setEditingId("new")}
          className="
            inline-flex items-center gap-1.5 rounded-lg border border-dashed border-indigo-300
            bg-white px-3 py-2 text-xs font-medium text-indigo-700 transition
            hover:border-indigo-400 hover:bg-indigo-50
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50
            dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300
            dark:hover:bg-indigo-950/40 dark:focus-visible:ring-offset-slate-950
            motion-reduce:transition-none
          "
        >
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
          Ajouter un indice ({5 - hints.length} restant{5 - hints.length > 1 ? "s" : ""})
        </button>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-500">
          Maximum 5 indices atteint.
        </p>
      )}

      {deleteId ? (
        <ConfirmDialog
          isOpen={true}
          title="Supprimer cet indice ?"
          description="Cette action est irréversible. L'historique reste dans l'audit log."
          variant="destructive"
          confirmLabel="Supprimer"
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      ) : null}
    </div>
  );
}

// ── View row ──────────────────────────────────────────────────────────────

function HintViewRow({
  hint,
  misconceptions,
  busy,
  onEdit,
  onDelete,
  onTogglePublish,
}: {
  hint: Hint;
  misconceptions: MisconceptionRow[];
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
}) {
  const linkedMisc = misconceptions.find((m) => m.id === hint.misconception_id);
  const isPublished = hint.approved_at !== null;

  return (
    <li
      aria-busy={busy || undefined}
      className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            Indice {hint.ordinal}
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {KIND_LABELS[hint.kind as HintKind] ?? hint.kind}
          </span>
          {isPublished ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 size={10} strokeWidth={2} aria-hidden="true" />
              Publié
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <CircleOff size={10} strokeWidth={2} aria-hidden="true" />
              Brouillon
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onTogglePublish}
            disabled={busy}
            className="
              inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium
              text-slate-700 transition hover:bg-slate-100
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              focus-visible:ring-offset-1
              disabled:opacity-50
              dark:text-slate-300 dark:hover:bg-slate-800
              motion-reduce:transition-none
            "
            aria-label={isPublished ? "Remettre en brouillon" : "Publier"}
          >
            {isPublished ? "Brouillon" : "Publier"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="
              rounded p-1 text-slate-600 transition hover:bg-slate-100
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              disabled:opacity-50
              dark:text-slate-400 dark:hover:bg-slate-800
              motion-reduce:transition-none
            "
            aria-label="Éditer l'indice"
          >
            <Edit2 size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="
              rounded p-1 text-red-600 transition hover:bg-red-50
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500
              disabled:opacity-50
              dark:text-red-400 dark:hover:bg-red-950/40
              motion-reduce:transition-none
            "
            aria-label="Supprimer l'indice"
          >
            <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{hint.template}</p>
      {linkedMisc ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
          → Lié à la misconception&nbsp;: <em>{linkedMisc.label}</em>
        </p>
      ) : null}
    </li>
  );
}

// ── Form row (add/edit) ───────────────────────────────────────────────────

type HintFormState = {
  template: string;
  ordinal: number;
  kind: HintKind;
  misconceptionId: string | null;
};

function HintFormRow({
  initial,
  suggestedOrdinal,
  misconceptions,
  saving,
  onSubmit,
  onCancel,
}: {
  initial: Hint | null;
  suggestedOrdinal?: number;
  misconceptions: MisconceptionRow[];
  saving: boolean;
  onSubmit: (form: HintFormState) => void;
  onCancel: () => void;
}) {
  const [template, setTemplate] = useState(initial?.template ?? "");
  const [ordinal, setOrdinal] = useState<number>(initial?.ordinal ?? suggestedOrdinal ?? 1);
  const [kind, setKind] = useState<HintKind>((initial?.kind as HintKind) ?? "guided_question");
  const [misconceptionId, setMisconceptionId] = useState<string | null>(
    initial?.misconception_id ?? null,
  );

  const isEdit = initial !== null;
  const trimmedLen = template.trim().length;
  const isValid = trimmedLen >= 20 && trimmedLen <= 1500;

  return (
    <li className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-800 dark:bg-indigo-950/20">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!isValid) return;
          onSubmit({ template: template.trim(), ordinal, kind, misconceptionId });
        }}
      >
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
            Position
            <select
              value={ordinal}
              onChange={(e) => setOrdinal(parseInt(e.target.value, 10))}
              disabled={saving}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {ORDINAL_LABELS[n - 1]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
            Type
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as HintKind)}
              disabled={saving}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              {HINT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          {misconceptions.length > 0 ? (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              Misconception liée
              <select
                value={misconceptionId ?? ""}
                onChange={(e) =>
                  setMisconceptionId(e.target.value === "" ? null : e.target.value)
                }
                disabled={saving}
                className="max-w-xs truncate rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">— Aucune —</option>
                {misconceptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label.slice(0, 60)}
                    {m.label.length > 60 ? "…" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          <span className="sr-only">Texte de l&apos;indice</span>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            disabled={saving}
            rows={3}
            placeholder="Ex: Regarde la formule au tableau. Que vaut 3 × 4 ?"
            className="
              mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm
              text-slate-900 placeholder:text-slate-400
              focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500
              disabled:opacity-60
              dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100
              dark:placeholder:text-slate-500
            "
          />
          <span
            className={`mt-1 inline-block text-[10px] ${
              isValid
                ? "text-slate-500 dark:text-slate-500"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {trimmedLen}/1500 caractères (min 20)
          </span>
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="
              inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium
              text-slate-700 transition hover:bg-slate-200
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500
              disabled:opacity-50
              dark:text-slate-300 dark:hover:bg-slate-800
              motion-reduce:transition-none
            "
          >
            <X size={12} strokeWidth={2} aria-hidden="true" />
            Annuler
          </button>
          <button
            type="submit"
            disabled={!isValid || saving}
            className="
              inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-xs
              font-medium text-white transition
              hover:bg-indigo-700
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              focus-visible:ring-offset-1
              disabled:opacity-50
              motion-reduce:transition-none
            "
          >
            {saving ? (
              <Loader2
                size={12}
                strokeWidth={2}
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Save size={12} strokeWidth={2} aria-hidden="true" />
            )}
            {isEdit ? "Enregistrer" : "Créer (brouillon)"}
          </button>
        </div>
      </form>
    </li>
  );
}
