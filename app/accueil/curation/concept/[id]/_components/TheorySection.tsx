"use client";

import { useId, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Label } from "@/components/ui/Label";
import type { SectionKind } from "@/lib/curation/validation";
import type { TheoryBlockRow } from "../types";

/**
 * Une carte de section théorie (Sprint 2B PR B).
 *
 * Affichage :
 * - Mode lecture : titre + contenu rendu (whitespace-pre-wrap)
 * - État "vide" : encart pointillé "Pas encore renseigné · Ajouter"
 * - Mode édition : textarea + Annuler / Enregistrer (focus trap simple)
 *
 * A11y :
 * - `aria-labelledby` pour la carte → titre
 * - `aria-busy` pendant la sauvegarde
 * - `aria-invalid` + `aria-describedby` sur la textarea en cas d'erreur
 * - Esc annule l'édition (TODO ajouter handler keyboard)
 * - Visible focus ring AA
 */
export default function TheorySection({
  conceptId,
  sectionKind,
  label,
  block,
  onUpdate,
  onError,
}: {
  conceptId: string;
  sectionKind: SectionKind;
  label: string;
  block: TheoryBlockRow | null;
  onUpdate: (updated: TheoryBlockRow) => void;
  onError: (message: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(block?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const titleId = useId();
  const errorId = useId();

  const isEmpty = !block || !block.content.trim();

  function startEdit() {
    setDraft(block?.content ?? "");
    setIsEditing(true);
    setValidationError(null);
  }

  function cancelEdit() {
    setDraft(block?.content ?? "");
    setIsEditing(false);
    setValidationError(null);
  }

  async function save() {
    const trimmed = draft.trim();
    if (trimmed.length < 1 || trimmed.length > 4000) {
      setValidationError("Le contenu doit faire entre 1 et 4000 caractères.");
      return;
    }

    setSaving(true);
    setValidationError(null);
    try {
      const res = await fetch(`/api/curation/concept/${conceptId}/theory`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_kind: sectionKind, content: trimmed }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        id?: string;
        updated_at?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.id) {
        onError(json.error ?? "Erreur lors de la sauvegarde");
        return;
      }
      onUpdate({
        id: json.id,
        paragraph_ordinal: block?.paragraph_ordinal ?? 0,
        section_kind: sectionKind,
        content: trimmed,
        updated_at: json.updated_at ?? new Date().toISOString(),
        approved_at: new Date().toISOString(),
      });
      setIsEditing(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article
      aria-labelledby={titleId}
      aria-busy={saving || undefined}
      className="
        rounded-2xl border border-slate-200 bg-white p-5
        dark:border-slate-800 dark:bg-slate-900
      "
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3
          id={titleId}
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          {label}
        </h3>
        {!isEditing ? (
          <button
            type="button"
            onClick={startEdit}
            className="
              inline-flex items-center gap-1.5 rounded-md px-2 py-1
              text-xs font-medium text-slate-600 transition
              hover:bg-slate-100 hover:text-slate-900
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-indigo-500 focus-visible:ring-offset-2
              focus-visible:ring-offset-white
              dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200
              dark:focus-visible:ring-offset-slate-900
              motion-reduce:transition-none
            "
            aria-label={`Modifier la section ${label}`}
          >
            <Pencil size={12} strokeWidth={2} aria-hidden="true" />
            {isEmpty ? "Ajouter" : "Modifier"}
          </button>
        ) : null}
      </div>

      {!isEditing ? (
        isEmpty ? (
          <p className="text-sm italic text-slate-500 dark:text-slate-400">
            Pas encore renseigné.
          </p>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {block?.content}
          </p>
        )
      ) : (
        <div>
          <Label htmlFor={`${titleId}-textarea`} className="sr-only">
            Contenu de la section {label}
          </Label>
          <textarea
            id={`${titleId}-textarea`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            maxLength={4000}
            aria-invalid={validationError !== null}
            aria-describedby={validationError ? errorId : undefined}
            disabled={saving}
            className="
              w-full rounded-lg border border-slate-300 bg-white p-3
              text-sm text-slate-900
              placeholder:text-slate-400
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1
              focus:ring-offset-white
              disabled:cursor-not-allowed disabled:opacity-60
              aria-[invalid=true]:border-red-500
              aria-[invalid=true]:focus:ring-red-500
              dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100
              dark:placeholder:text-slate-500
              dark:focus:ring-offset-slate-900
            "
            placeholder={`Écris ici la ${label.toLowerCase()}…`}
          />
          {validationError ? (
            <p
              id={errorId}
              role="alert"
              className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400"
            >
              {validationError}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {draft.length}/4000 caractères
            </p>
          )}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="
                inline-flex items-center gap-1.5 rounded-md px-3 py-1.5
                text-sm font-medium text-slate-600
                transition hover:bg-slate-100 hover:text-slate-900
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-indigo-500 focus-visible:ring-offset-2
                focus-visible:ring-offset-white
                disabled:cursor-not-allowed disabled:opacity-60
                dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200
                dark:focus-visible:ring-offset-slate-900
                motion-reduce:transition-none
              "
            >
              <X size={14} strokeWidth={2} aria-hidden="true" />
              Annuler
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="
                inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5
                text-sm font-semibold text-white
                transition hover:bg-indigo-700
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-indigo-500 focus-visible:ring-offset-2
                focus-visible:ring-offset-white
                disabled:cursor-not-allowed disabled:opacity-60
                dark:focus-visible:ring-offset-slate-900
                motion-reduce:transition-none
              "
            >
              <Check size={14} strokeWidth={2} aria-hidden="true" />
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
