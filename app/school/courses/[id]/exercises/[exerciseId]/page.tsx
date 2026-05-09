"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import MarkdownLatex from "@/components/MarkdownLatex";

// ── Types ─────────────────────────────────────────────────────────────────────

type ExerciseStatus = "pending" | "validated" | "rejected" | "archived";

type Step = {
  id: string;
  step_number: number;
  title: string | null;
  content: string;
  method_or_concept: string | null;
  is_final_answer: boolean;
};

type Exercise = {
  id: string;
  course_id: string;
  title: string;
  statement: string;
  exercise_type: string | null;
  difficulty: number | null;
  status: ExerciseStatus;
  generated_by_model: string | null;
  created_at: string;
  exercise_steps: Step[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const EXERCISE_TYPES = ["calcul", "demonstration", "analyse", "redaction", "application", "autre"] as const;

const TYPE_LABELS: Record<string, string> = {
  calcul: "Calcul", demonstration: "Démonstration", analyse: "Analyse",
  redaction: "Rédaction", application: "Application", autre: "Autre",
};

const TYPE_BADGE: Record<string, string> = {
  calcul: "bg-blue-500/20 text-blue-300", demonstration: "bg-purple-500/20 text-purple-300",
  analyse: "bg-cyan-500/20 text-cyan-300", redaction: "bg-amber-500/20 text-amber-300",
  application: "bg-green-500/20 text-green-300", autre: "bg-gray-500/20 text-gray-400",
};

const STATUS_BADGE: Record<ExerciseStatus, string> = {
  pending:   "bg-amber-500/20 text-amber-300 border-amber-500/30",
  validated: "bg-green-500/20 text-green-300 border-green-500/30",
  rejected:  "bg-red-500/20 text-red-300 border-red-500/30",
  archived:  "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const STATUS_LABELS: Record<ExerciseStatus, string> = {
  pending: "À valider", validated: "Validé", rejected: "Rejeté", archived: "Archivé",
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function Stars({
  value,
  onChange,
}: {
  value: number | null;
  onChange?: (v: 1 | 2 | 3) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {([1, 2, 3] as const).map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange?.(star)}
          disabled={!onChange}
          className={`text-2xl leading-none transition ${
            value !== null && star <= value
              ? "text-yellow-400"
              : "text-gray-600"
          } ${onChange ? "hover:text-yellow-300 cursor-pointer" : "cursor-default"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: ExerciseStatus }) {
  return (
    <span className={`inline-block rounded-full border px-3 py-1 text-xs font-black ${STATUS_BADGE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Inline editable title ─────────────────────────────────────────────────────

function EditableTitle({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!draft.trim() || draft.trim() === value) { setEditing(false); return; }
    setSaving(true);
    await onSave(draft.trim());
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 flex-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
          maxLength={80}
          className="flex-1 rounded-xl border border-purple-500/50 bg-gray-800 px-3 py-1.5 text-xl font-black text-white outline-none"
        />
        <button onClick={confirm} disabled={saving} className="rounded-lg bg-purple-500 px-3 py-1.5 text-sm font-black text-gray-950 disabled:opacity-40">
          {saving ? "…" : "✓"}
        </button>
        <button onClick={() => { setDraft(value); setEditing(false); }} className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm font-bold text-gray-400">
          ✕
        </button>
      </div>
    );
  }

  return (
    <h1
      className="text-2xl font-black text-white cursor-pointer hover:text-purple-300 transition flex-1"
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Cliquer pour modifier"
    >
      {value}
    </h1>
  );
}

// ── Statement editor ──────────────────────────────────────────────────────────

function StatementEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <div
        className="cursor-pointer rounded-xl border border-transparent p-3 hover:border-gray-700 hover:bg-gray-800/40 transition"
        onClick={() => { setDraft(value); setEditing(true); }}
        title="Cliquer pour modifier l'énoncé"
      >
        <MarkdownLatex content={value} />
        <p className="mt-2 text-xs text-gray-600">✎ Cliquer pour modifier</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-purple-500/40 bg-gray-800/60 p-4">
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setTab("edit")}
          className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${tab === "edit" ? "bg-purple-500/20 text-purple-300" : "text-gray-500 hover:text-white"}`}
        >
          Éditer
        </button>
        <button
          onClick={() => setTab("preview")}
          className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${tab === "preview" ? "bg-purple-500/20 text-purple-300" : "text-gray-500 hover:text-white"}`}
        >
          Aperçu
        </button>
      </div>
      {tab === "edit" ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={8}
          className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none font-mono resize-y focus:border-purple-500"
        />
      ) : (
        <div className="min-h-[100px] rounded-xl border border-gray-700 bg-gray-900 p-3">
          <MarkdownLatex content={draft} />
        </div>
      )}
      <div className="mt-3 flex gap-2 justify-end">
        <button
          onClick={() => setEditing(false)}
          className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-bold text-gray-300 hover:text-white"
        >
          Annuler
        </button>
        <button
          onClick={async () => {
            if (!draft.trim()) return;
            setSaving(true);
            await onSave(draft.trim());
            setSaving(false);
            setEditing(false);
          }}
          disabled={saving}
          className="rounded-xl bg-purple-500 px-4 py-2 text-sm font-black text-gray-950 hover:bg-purple-400 disabled:opacity-40"
        >
          {saving ? "Sauvegarde…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

// ── Step editor ───────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  total,
  onUpdate,
  onDelete,
  onMove,
}: {
  step: Step;
  index: number;
  total: number;
  onUpdate: (s: Step) => void;
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(step.title ?? "");
  const [editingContent, setEditingContent] = useState(false);
  const [contentDraft, setContentDraft] = useState(step.content);
  const [contentTab, setContentTab] = useState<"edit" | "preview">("edit");
  const [editingMethod, setEditingMethod] = useState(false);
  const [methodDraft, setMethodDraft] = useState(step.method_or_concept ?? "");

  return (
    <div className={`rounded-2xl border p-4 ${step.is_final_answer ? "border-green-500/30 bg-green-500/5" : "border-gray-700 bg-gray-900"}`}>
      {/* Step header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/20 text-xs font-black text-purple-300 shrink-0">
          {step.step_number}
        </span>

        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                onUpdate({ ...step, title: titleDraft.trim() || null });
                setEditingTitle(false);
              }
            }}
            onBlur={() => { onUpdate({ ...step, title: titleDraft.trim() || null }); setEditingTitle(false); }}
            className="flex-1 rounded-lg border border-purple-500/50 bg-gray-800 px-2 py-1 text-sm font-black text-white outline-none"
          />
        ) : (
          <span
            className="flex-1 text-sm font-black text-white cursor-pointer hover:text-purple-300"
            onClick={() => { setTitleDraft(step.title ?? ""); setEditingTitle(true); }}
          >
            {step.title || <span className="text-gray-600 italic font-normal">Cliquer pour nommer l&apos;étape</span>}
          </span>
        )}

        {/* Reorder + controls */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <button
            onClick={() => onMove("up")}
            disabled={index === 0}
            className="rounded-lg p-1 text-gray-500 hover:text-white disabled:opacity-20 transition"
            title="Monter"
          >▲</button>
          <button
            onClick={() => onMove("down")}
            disabled={index === total - 1}
            className="rounded-lg p-1 text-gray-500 hover:text-white disabled:opacity-20 transition"
            title="Descendre"
          >▼</button>
          <button
            onClick={() => { if (confirm("Supprimer cette étape ?")) onDelete(); }}
            className="rounded-lg p-1 text-red-500/60 hover:text-red-400 transition"
            title="Supprimer"
          >✕</button>
        </div>
      </div>

      {/* Content */}
      <div className="mb-3">
        {editingContent ? (
          <div className="rounded-xl border border-purple-500/40 bg-gray-800/60 p-3">
            <div className="flex gap-2 mb-2">
              <button onClick={() => setContentTab("edit")} className={`rounded-md px-2 py-1 text-xs font-black ${contentTab === "edit" ? "bg-purple-500/20 text-purple-300" : "text-gray-500"}`}>Éditer</button>
              <button onClick={() => setContentTab("preview")} className={`rounded-md px-2 py-1 text-xs font-black ${contentTab === "preview" ? "bg-purple-500/20 text-purple-300" : "text-gray-500"}`}>Aperçu</button>
            </div>
            {contentTab === "edit" ? (
              <textarea
                autoFocus
                value={contentDraft}
                onChange={(e) => setContentDraft(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none font-mono resize-y focus:border-purple-500"
              />
            ) : (
              <div className="rounded-lg border border-gray-700 bg-gray-900 p-3 min-h-[80px]">
                <MarkdownLatex content={contentDraft} />
              </div>
            )}
            <div className="mt-2 flex gap-2 justify-end">
              <button onClick={() => { setContentDraft(step.content); setEditingContent(false); }} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-bold text-gray-300">Annuler</button>
              <button onClick={() => { onUpdate({ ...step, content: contentDraft }); setEditingContent(false); }} className="rounded-lg bg-purple-500 px-3 py-1.5 text-xs font-black text-gray-950">Enregistrer</button>
            </div>
          </div>
        ) : (
          <div
            className="cursor-pointer rounded-lg border border-transparent p-2 hover:border-gray-700 hover:bg-gray-800/40 transition"
            onClick={() => { setContentDraft(step.content); setEditingContent(true); }}
          >
            <MarkdownLatex content={step.content} />
          </div>
        )}
      </div>

      {/* Method/concept + final answer toggle */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-800 pt-3">
        <div className="flex-1 min-w-0">
          {editingMethod ? (
            <input
              autoFocus
              value={methodDraft}
              onChange={(e) => setMethodDraft(e.target.value)}
              onBlur={() => { onUpdate({ ...step, method_or_concept: methodDraft.trim() || null }); setEditingMethod(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  onUpdate({ ...step, method_or_concept: methodDraft.trim() || null });
                  setEditingMethod(false);
                }
              }}
              placeholder="Concept ou règle appliquée…"
              className="w-full rounded-lg border border-purple-500/50 bg-gray-800 px-2 py-1 text-xs text-purple-300 outline-none"
            />
          ) : (
            <span
              className={`text-xs cursor-pointer hover:text-purple-300 transition ${step.method_or_concept ? "text-purple-400" : "text-gray-600 italic"}`}
              onClick={() => { setMethodDraft(step.method_or_concept ?? ""); setEditingMethod(true); }}
            >
              {step.method_or_concept ?? "Concept / règle (cliquer pour modifier)"}
            </span>
          )}
        </div>
        <button
          onClick={() => onUpdate({ ...step, is_final_answer: !step.is_final_answer })}
          className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-black transition ${
            step.is_final_answer
              ? "border-green-500/50 bg-green-500/10 text-green-300"
              : "border-gray-700 text-gray-500 hover:border-gray-500"
          }`}
        >
          {step.is_final_answer ? "✓ Réponse finale" : "Réponse finale"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExerciseDetailPage() {
  const { id: courseId, exerciseId } = useParams<{ id: string; exerciseId: string }>();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepsDirty, setStepsDirty] = useState(false);
  const [savingSteps, setSavingSteps] = useState(false);
  const [pendingStars, setPendingStars] = useState<1 | 2 | 3 | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const loadExercise = useCallback(async () => {
    const res = await fetch(`/api/courses/${courseId}/exercises/${exerciseId}`);
    const data = await res.json() as { exercise?: Exercise; error?: string };
    if (data.exercise) {
      setExercise(data.exercise);
      setSteps(data.exercise.exercise_steps);
      setPendingStars((data.exercise.difficulty as 1 | 2 | 3 | null) ?? null);
    }
    setLoading(false);
  }, [courseId, exerciseId]);

  useEffect(() => { loadExercise(); }, [loadExercise]);

  // ── Inline field patches ──

  async function patchField(body: Record<string, unknown>) {
    const res = await fetch(`/api/courses/${courseId}/exercises/${exerciseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { exercise?: Exercise; error?: string };
    if (data.exercise) setExercise(data.exercise);
    if (!res.ok) showToast(data.error ?? "Erreur");
  }

  // ── Steps management ──

  function updateStep(index: number, updated: Step) {
    setSteps((prev) => prev.map((s, i) => (i === index ? updated : s)));
    setStepsDirty(true);
  }

  function deleteStep(index: number) {
    setSteps((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((s, i) => ({ ...s, step_number: i + 1 }));
    });
    setStepsDirty(true);
  }

  function moveStep(index: number, dir: "up" | "down") {
    setSteps((prev) => {
      const next = [...prev];
      const target = dir === "up" ? index - 1 : index + 1;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((s, i) => ({ ...s, step_number: i + 1 }));
    });
    setStepsDirty(true);
  }

  function addStep() {
    const newStep: Step = {
      id: `new-${Date.now()}`,
      step_number: steps.length + 1,
      title: null,
      content: "",
      method_or_concept: null,
      is_final_answer: false,
    };
    setSteps((prev) => [...prev, newStep]);
    setStepsDirty(true);
  }

  async function saveSteps() {
    setSavingSteps(true);
    const res = await fetch(`/api/courses/${courseId}/exercises/${exerciseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps }),
    });
    const data = await res.json() as { exercise?: Exercise; error?: string };
    if (data.exercise) {
      setExercise(data.exercise);
      setSteps(data.exercise.exercise_steps);
      setStepsDirty(false);
      showToast("Étapes sauvegardées ✓");
    } else {
      showToast(data.error ?? "Erreur lors de la sauvegarde");
    }
    setSavingSteps(false);
  }

  // ── Status actions ──

  async function doAction(endpoint: string, body?: Record<string, unknown>) {
    setActionBusy(true);
    const res = await fetch(`/api/courses/${courseId}/exercises/${exerciseId}/${endpoint}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : "{}",
    });
    const data = await res.json() as { exercise?: Exercise; error?: string };
    if (data.exercise) setExercise(data.exercise);
    if (!res.ok) showToast(data.error ?? "Erreur");
    setActionBusy(false);
    return res.ok;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="h-5 w-32 animate-pulse rounded-lg bg-gray-800" />
          <div className="h-8 w-2/3 animate-pulse rounded-lg bg-gray-800" />
          <div className="h-40 animate-pulse rounded-2xl bg-gray-800" />
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-800" />)}
        </div>
      </main>
    );
  }

  if (!exercise) {
    return (
      <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
          <p className="font-black text-red-300">Exercice introuvable.</p>
          <Link href={`/school/courses/${courseId}/exercises`} className="mt-3 inline-block text-sm text-gray-400 hover:text-purple-300">
            ← Retour à la liste
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-3xl">

        {/* Breadcrumb */}
        <Link
          href={`/school/courses/${courseId}/exercises`}
          className="text-sm font-bold text-gray-500 transition hover:text-purple-400"
        >
          ← Retour à la liste
        </Link>

        {/* Header */}
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <EditableTitle
            value={exercise.title}
            onSave={async (v) => { await patchField({ title: v }); showToast("Titre modifié ✓"); }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Type selector */}
          <select
            value={exercise.exercise_type ?? ""}
            onChange={async (e) => {
              await patchField({ exercise_type: e.target.value });
              showToast("Type modifié ✓");
            }}
            className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white outline-none focus:border-purple-500"
          >
            <option value="">Type…</option>
            {EXERCISE_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>

          {/* Status badge */}
          <StatusBadge status={exercise.status} />

          {exercise.generated_by_model && (
            <span className="text-xs text-gray-600 ml-auto">
              {exercise.generated_by_model}
            </span>
          )}
        </div>

        {/* Statement */}
        <div className="mt-6">
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-500">Énoncé</p>
          <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
            <StatementEditor
              value={exercise.statement}
              onSave={async (v) => { await patchField({ statement: v }); showToast("Énoncé modifié ✓"); }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-gray-500">
              Résolution étape par étape
            </p>
            {stepsDirty && (
              <button
                onClick={saveSteps}
                disabled={savingSteps}
                className="rounded-xl bg-purple-500 px-4 py-2 text-xs font-black text-gray-950 hover:bg-purple-400 disabled:opacity-40"
              >
                {savingSteps ? "Sauvegarde…" : "Sauvegarder les étapes"}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {steps.map((step, index) => (
              <StepCard
                key={step.id}
                step={step}
                index={index}
                total={steps.length}
                onUpdate={(updated) => updateStep(index, updated)}
                onDelete={() => deleteStep(index)}
                onMove={(dir) => moveStep(index, dir)}
              />
            ))}
          </div>

          <button
            onClick={addStep}
            className="mt-3 w-full rounded-2xl border border-dashed border-gray-700 py-3 text-sm font-bold text-gray-500 hover:border-purple-500/50 hover:text-purple-400 transition"
          >
            + Ajouter une étape
          </button>
        </div>

        {/* Footer actions */}
        <div className="mt-10 rounded-2xl border border-gray-700 bg-gray-900 p-5">
          <p className="mb-4 text-xs font-black uppercase tracking-widest text-gray-500">Actions</p>

          {exercise.status === "pending" && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => doAction("reject").then((ok) => ok && showToast("Exercice rejeté"))}
                disabled={actionBusy}
                className="rounded-xl border border-red-500/30 px-4 py-2.5 text-sm font-black text-red-400 hover:bg-red-500/10 disabled:opacity-40"
              >
                Rejeter
              </button>
              <div className="flex items-center gap-3 ml-auto flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Difficulté :</span>
                  <Stars value={pendingStars} onChange={setPendingStars} />
                </div>
                <button
                  onClick={() => doAction("validate", { difficulty: pendingStars ?? 1 }).then((ok) => ok && showToast("Exercice validé ✓"))}
                  disabled={actionBusy}
                  className="rounded-xl bg-green-500 px-5 py-2.5 text-sm font-black text-gray-950 hover:bg-green-400 disabled:opacity-40"
                >
                  {actionBusy ? "…" : "Valider"}
                </button>
              </div>
            </div>
          )}

          {exercise.status === "validated" && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-xl bg-green-500/10 px-3 py-2 text-sm font-black text-green-300">
                ✓ Validé
                <Stars value={exercise.difficulty} />
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Modifier :</span>
                <Stars value={pendingStars} onChange={setPendingStars} />
                <button
                  onClick={async () => {
                    if (!pendingStars) return;
                    await doAction("validate", { difficulty: pendingStars });
                    showToast("Difficulté modifiée ✓");
                  }}
                  disabled={actionBusy || !pendingStars || pendingStars === exercise.difficulty}
                  className="rounded-xl border border-gray-700 px-3 py-1.5 text-xs font-bold text-gray-300 hover:text-white disabled:opacity-40"
                >
                  Appliquer
                </button>
              </div>
              <button
                onClick={() => doAction("archive").then((ok) => ok && showToast("Exercice archivé"))}
                disabled={actionBusy}
                className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-bold text-gray-400 hover:text-white ml-auto disabled:opacity-40"
              >
                Archiver
              </button>
            </div>
          )}

          {exercise.status === "rejected" && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-black text-red-300">Rejeté</span>
              <button
                onClick={() => doAction("restore").then((ok) => ok && showToast("Exercice restauré en À valider ✓"))}
                disabled={actionBusy}
                className="rounded-xl bg-amber-500/20 px-4 py-2 text-sm font-black text-amber-300 hover:bg-amber-500/30 disabled:opacity-40"
              >
                Restaurer en À valider
              </button>
            </div>
          )}

          {exercise.status === "archived" && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-xl bg-gray-500/10 px-3 py-2 text-sm font-black text-gray-400">Archivé</span>
              <button
                onClick={() => doAction("restore").then((ok) => ok && showToast("Exercice restauré ✓"))}
                disabled={actionBusy}
                className="rounded-xl bg-amber-500/20 px-4 py-2 text-sm font-black text-amber-300 hover:bg-amber-500/30 disabled:opacity-40"
              >
                Restaurer
              </button>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-2xl bg-green-500 px-6 py-3 font-black text-gray-950 shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
