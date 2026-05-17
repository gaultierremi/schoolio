"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

// ── Types ─────────────────────────────────────────────────────────────────────

const VALID_COLORS = ["purple", "blue", "red", "orange", "green", "yellow", "pink", "gray"] as const;
type TagColor = (typeof VALID_COLORS)[number];

type TagUsage = { courses: number; questions: number; classes: number };

type Tag = {
  id: string;
  name: string;
  emoji: string | null;
  color: TagColor;
  description: string | null;
  usage: TagUsage;
  created_at: string | null;
  updated_at: string | null;
};

type TagForm = {
  name: string;
  emoji: string;
  color: TagColor;
  description: string;
};

type ModalMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; tag: Tag };

type DeleteState =
  | { kind: "closed" }
  | { kind: "confirm"; tag: Tag }
  | { kind: "force"; tag: Tag };

type ToastState = { msg: string; color: TagColor | null } | null;

type ProfileId = "sciences" | "math" | "langues" | "humaines" | "autre";

type SuggestionItem = {
  name: string;
  emoji: string;
  color: TagColor;
  description: string;
};

type EmptyViewMode =
  | { kind: "onboarding-step1" }
  | { kind: "onboarding-step2"; profiles: ProfileId[] }
  | { kind: "fallback" };

// ── Constants ─────────────────────────────────────────────────────────────────

const COLOR_STYLES: Record<
  TagColor,
  {
    cardBg: string;
    cardBorder: string;
    text: string;
    dot: string;
    ring: string;
    shadowHover: string;
    barFrom: string;
    barTo: string;
    toastBg: string;
    toastBorder: string;
    toastText: string;
  }
> = {
  purple: {
    cardBg: "bg-purple-50",
    cardBorder: "border-purple-200",
    text: "text-purple-700",
    dot: "bg-purple-500",
    ring: "ring-purple-400",
    shadowHover: "hover:shadow-purple-200",
    barFrom: "from-purple-500",
    barTo: "to-purple-300",
    toastBg: "bg-purple-600",
    toastBorder: "border-purple-700",
    toastText: "text-[rgb(var(--ink))]",
  },
  blue: {
    cardBg: "bg-blue-50",
    cardBorder: "border-blue-200",
    text: "text-blue-700",
    dot: "bg-blue-500",
    ring: "ring-blue-400",
    shadowHover: "hover:shadow-blue-200",
    barFrom: "from-blue-500",
    barTo: "to-blue-300",
    toastBg: "bg-blue-600",
    toastBorder: "border-blue-700",
    toastText: "text-[rgb(var(--ink))]",
  },
  red: {
    cardBg: "bg-red-50",
    cardBorder: "border-red-200",
    text: "text-red-700",
    dot: "bg-red-500",
    ring: "ring-red-400",
    shadowHover: "hover:shadow-red-200",
    barFrom: "from-red-500",
    barTo: "to-red-300",
    toastBg: "bg-red-600",
    toastBorder: "border-red-700",
    toastText: "text-[rgb(var(--ink))]",
  },
  orange: {
    cardBg: "bg-orange-50",
    cardBorder: "border-orange-200",
    text: "text-orange-700",
    dot: "bg-orange-500",
    ring: "ring-orange-400",
    shadowHover: "hover:shadow-orange-200",
    barFrom: "from-orange-500",
    barTo: "to-orange-300",
    toastBg: "bg-orange-600",
    toastBorder: "border-orange-700",
    toastText: "text-[rgb(var(--ink))]",
  },
  green: {
    cardBg: "bg-green-50",
    cardBorder: "border-green-200",
    text: "text-green-700",
    dot: "bg-green-500",
    ring: "ring-green-400",
    shadowHover: "hover:shadow-green-200",
    barFrom: "from-green-500",
    barTo: "to-green-300",
    toastBg: "bg-green-600",
    toastBorder: "border-green-700",
    toastText: "text-[rgb(var(--ink))]",
  },
  yellow: {
    cardBg: "bg-yellow-50",
    cardBorder: "border-yellow-200",
    text: "text-yellow-800",
    dot: "bg-yellow-500",
    ring: "ring-yellow-400",
    shadowHover: "hover:shadow-yellow-200",
    barFrom: "from-yellow-500",
    barTo: "to-yellow-300",
    toastBg: "bg-yellow-500",
    toastBorder: "border-yellow-600",
    toastText: "text-[rgb(var(--ink))]",
  },
  pink: {
    cardBg: "bg-pink-50",
    cardBorder: "border-pink-200",
    text: "text-pink-700",
    dot: "bg-pink-500",
    ring: "ring-pink-400",
    shadowHover: "hover:shadow-pink-200",
    barFrom: "from-pink-500",
    barTo: "to-pink-300",
    toastBg: "bg-pink-600",
    toastBorder: "border-pink-700",
    toastText: "text-[rgb(var(--ink))]",
  },
  gray: {
    cardBg: "bg-[rgb(var(--surface-3))]",
    cardBorder: "border-[rgb(var(--border))]",
    text: "text-[rgb(var(--ink-2))]",
    dot: "bg-[rgb(var(--ink-3))]",
    ring: "ring-[rgb(var(--ink-3))]",
    shadowHover: "hover:shadow-[rgb(var(--border))]",
    barFrom: "from-[rgb(var(--ink-3))]",
    barTo: "to-[rgb(var(--ink-2))]",
    toastBg: "bg-[rgb(var(--ink))]",
    toastBorder: "border-[rgb(var(--ink-2))]",
    toastText: "text-[rgb(var(--ink))]",
  },
};

const PRESET_EMOJIS = [
  "⚗️","🧪","📚","🎓","🔬","📝","✏️","🌟",
  "🎯","🚀","💡","⚡","🔥","💎","📐","🌊",
];

const SUGGESTED_TAGS: SuggestionItem[] = [
  { name: "Sciences fortes",    emoji: "⚗️", color: "red",    description: "Pour les classes en filière approfondie" },
  { name: "Sciences classiques",emoji: "🧪", color: "blue",   description: "Pour les classes en filière standard" },
  { name: "Cours communs",      emoji: "📚", color: "gray",   description: "Pour les contenus partagés entre classes" },
  { name: "Remédiation",        emoji: "🎯", color: "orange", description: "Pour les sessions de soutien" },
];

const BLANK_FORM: TagForm = { name: "", emoji: "", color: "purple", description: "" };

// ── Onboarding constants ──────────────────────────────────────────────────────

const PROFILE_OPTIONS: Array<{ id: ProfileId; emoji: string; label: string; sublabel: string }> = [
  { id: "sciences", emoji: "🔬", label: "Sciences",          sublabel: "chimie, physique, bio" },
  { id: "math",     emoji: "🔢", label: "Mathématiques",     sublabel: "" },
  { id: "langues",  emoji: "📖", label: "Langues",           sublabel: "français, anglais, néerlandais" },
  { id: "humaines", emoji: "📜", label: "Sciences humaines", sublabel: "histoire, géo" },
  { id: "autre",    emoji: "🎨", label: "Autre",             sublabel: "art, sport, technologie…" },
];

const PROFILE_LABELS: Record<ProfileId, string> = {
  sciences: "Sciences",
  math:     "Math",
  langues:  "Langues",
  humaines: "Sciences humaines",
  autre:    "Autre",
};

const SUGGESTIONS_BY_PROFILE: Record<ProfileId, SuggestionItem[]> = {
  sciences: [
    { name: "Sciences fortes",    emoji: "⚗️", color: "red",   description: "Pour les classes en filière approfondie" },
    { name: "Sciences classiques",emoji: "🧪", color: "blue",  description: "Pour les classes en filière standard" },
    { name: "Travaux pratiques",  emoji: "🔬", color: "green", description: "Pour les laboratoires et expériences" },
    { name: "Cours communs",      emoji: "📚", color: "gray",  description: "Pour les contenus partagés entre classes" },
  ],
  math: [
    { name: "Math 4h",       emoji: "📐", color: "blue",   description: "Pour la filière 4h/semaine" },
    { name: "Math 6h",       emoji: "🧮", color: "purple", description: "Pour la filière 6h/semaine" },
    { name: "Math 8h",       emoji: "📊", color: "red",    description: "Pour la filière 8h/semaine renforcée" },
    { name: "Cours communs", emoji: "📚", color: "gray",   description: "Pour les contenus partagés" },
  ],
  langues: [
    { name: "Langue moderne",     emoji: "🌍", color: "purple", description: "Pour la filière LM" },
    { name: "Option de base",     emoji: "📝", color: "gray",   description: "Pour la filière OB" },
    { name: "Préparation examen", emoji: "✍️", color: "orange", description: "Pour les sessions d'entraînement" },
    { name: "Cours communs",      emoji: "📚", color: "gray",   description: "Pour les contenus partagés" },
  ],
  humaines: [
    { name: "Programme principal", emoji: "📜", color: "purple", description: "Pour le contenu du programme officiel" },
    { name: "Approfondissement",   emoji: "🌍", color: "orange", description: "Pour les sujets complémentaires" },
    { name: "Cours communs",       emoji: "📚", color: "gray",   description: "Pour les contenus partagés" },
  ],
  autre: [
    { name: "Cours principal",   emoji: "📚", color: "purple", description: "Pour ton programme principal" },
    { name: "Approfondissement", emoji: "🎯", color: "orange", description: "Pour les contenus avancés" },
    { name: "Remédiation",       emoji: "💡", color: "yellow", description: "Pour le soutien" },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function totalUsage(u: TagUsage) {
  return u.courses + u.questions + u.classes;
}

function usageLabel(u: TagUsage): string {
  const parts: string[] = [];
  if (u.courses   > 0) parts.push(`${u.courses} cours`);
  if (u.questions > 0) parts.push(`${u.questions} question${u.questions > 1 ? "s" : ""}`);
  if (u.classes   > 0) parts.push(`${u.classes} classe${u.classes > 1 ? "s" : ""}`);
  return parts.length > 0 ? parts.join(" · ") : "Pas encore utilisé";
}

function mergeSuggestions(profiles: ProfileId[]): SuggestionItem[] {
  const seen   = new Set<string>();
  const result: SuggestionItem[] = [];
  for (const profile of profiles) {
    for (const s of SUGGESTIONS_BY_PROFILE[profile]) {
      const key = s.name.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(s);
      }
    }
  }
  return result;
}

function profileSubtitle(profiles: ProfileId[]): string {
  const labels = profiles.map((p) => PROFILE_LABELS[p]);
  if (labels.length === 1) return `Pour un prof de ${labels[0]}, on suggère :`;
  if (labels.length === 2) return `Pour un prof de ${labels[0]} + ${labels[1]}, on suggère :`;
  return `Pour un prof de ${labels[0]} + ${labels[1]} + ${labels[2]}, on suggère :`;
}

// ── SkeletonBlock ─────────────────────────────────────────────────────────────

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-[rgb(var(--surface-3))] ${className ?? ""}`} />;
}

// ── TagCard ───────────────────────────────────────────────────────────────────

type TagCardProps = {
  tag: Partial<Tag> & { name: string; color: TagColor };
  maxUsage?: number;
  onEdit?: () => void;
  onDelete?: () => void;
  isPreview?: boolean;
};

function TagCard({ tag, maxUsage = 0, onEdit, onDelete, isPreview = false }: TagCardProps) {
  const s = COLOR_STYLES[tag.color];
  const usage = tag.usage ?? { courses: 0, questions: 0, classes: 0 };
  const total = totalUsage(usage);
  const pct   = maxUsage > 0 ? Math.round((total / maxUsage) * 100) : 0;
  const displayName  = tag.name.trim() || "Nom du tag";
  const displayEmoji = tag.emoji || "🏷️";

  return (
    <div
      className={[
        "group relative rounded-2xl border p-5 transition-all duration-200",
        s.cardBg,
        s.cardBorder,
        !isPreview
          ? `hover:-translate-y-0.5 hover:shadow-lg ${s.shadowHover} cursor-default`
          : "opacity-90",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl leading-none shrink-0">{displayEmoji}</span>
          <span className={`truncate text-lg font-black leading-tight ${tag.name.trim() ? "text-[rgb(var(--ink))]" : "italic text-[rgb(var(--ink-3))]"}`}>
            {displayName}
          </span>
        </div>

        {/* Actions — visible en hover desktop, toujours visible mobile */}
        {!isPreview && (onEdit || onDelete) && (
          <div className="flex shrink-0 gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
            {onEdit && (
              <button
                onClick={onEdit}
                className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1.5 text-xs font-bold text-[rgb(var(--ink-2))] transition-colors hover:border-[rgb(var(--accent))]/50 hover:text-[rgb(var(--accent))]"
                aria-label="Modifier"
              >
                ✏️
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="rounded-xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--surface))] px-2.5 py-1.5 text-xs font-bold text-[rgb(var(--red))] transition-colors hover:bg-[rgb(var(--red))]/10"
                aria-label="Supprimer"
              >
                🗑️
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <p className="mt-2 text-sm text-[rgb(var(--ink-2))]">
        {isPreview ? (
          <span className="italic text-[rgb(var(--ink-3))]">Aperçu — stats disponibles après création</span>
        ) : (
          usageLabel(usage)
        )}
      </p>

      {/* Progress bar */}
      {!isPreview && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--border))]">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${s.barFrom} ${s.barTo} transition-all duration-500 group-hover:animate-pulse`}
            style={{ width: `${Math.max(pct, total > 0 ? 8 : 0)}%` }}
          />
        </div>
      )}

      {/* Description */}
      {tag.description && (
        <p className="mt-3 text-xs leading-relaxed text-[rgb(var(--ink-2))]">
          {tag.description}
        </p>
      )}

      {/* Preview label */}
      {isPreview && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.dot}`} />
          <span className="text-xs text-[rgb(var(--ink-3))]">Couleur : {tag.color}</span>
        </div>
      )}
    </div>
  );
}

// ── TagModal ──────────────────────────────────────────────────────────────────

type TagModalProps = {
  mode: "create" | "edit";
  initialTag?: Tag;
  onClose: () => void;
  onSaved: (tag: Tag, isNew: boolean) => void;
};

function TagModal({ mode, initialTag, onClose, onSaved }: TagModalProps) {
  const [form, setForm]           = useState<TagForm>(
    initialTag
      ? { name: initialTag.name, emoji: initialTag.emoji ?? "", color: initialTag.color, description: initialTag.description ?? "" }
      : { ...BLANK_FORM }
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);

  const nameId            = useId();
  const emojiLabelId      = useId();
  const emojiInputId      = useId();
  const colorLabelId      = useId();
  const descriptionId     = useId();

  const previewTag: Partial<Tag> & { name: string; color: TagColor } = {
    name:        form.name,
    emoji:       form.emoji || null,
    color:       form.color,
    description: form.description || null,
    usage:       { courses: 0, questions: 0, classes: 0 },
  };

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError("Le nom est requis.");
      return;
    }
    setSaving(true);
    setFormError(null);

    const body = {
      name:        form.name.trim(),
      emoji:       form.emoji.trim() || null,
      color:       form.color,
      description: form.description.trim() || null,
    };

    try {
      const url    = mode === "edit" ? `/api/teacher-tags/${initialTag!.id}` : "/api/teacher-tags";
      const method = mode === "edit" ? "PATCH" : "POST";

      const res  = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (res.status === 409) {
        setFormError("Un tag avec ce nom existe déjà.");
        setSaving(false);
        return;
      }
      if (!res.ok) {
        setFormError(json.error ?? "Erreur lors de la sauvegarde.");
        setSaving(false);
        return;
      }

      const saved = json.tag as Tag;
      onSaved(saved, mode === "create");
    } catch {
      setFormError("Erreur réseau.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (!saving && e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape" && !saving) onClose(); }}
      role="button"
      tabIndex={-1}
      aria-label="Fermer la fenêtre"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Modal header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))]/95 px-6 py-4">
          <h2 className="text-lg font-black text-[rgb(var(--ink))]">
            {mode === "create" ? "✨ Créer un tag" : "Modifier le tag"}
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))] transition-colors disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row">
            {/* ── Gauche : formulaire ── */}
            <div className="flex-1 space-y-5">

              {/* Nom */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor={nameId} className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                    Nom du tag *
                  </label>
                  <span className={`text-xs ${form.name.length > 40 ? "text-[rgb(var(--warm))]" : "text-[rgb(var(--ink-3))]"}`}>
                    {form.name.length}/50
                  </span>
                </div>
                <input
                  id={nameId}
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    setForm({ ...form, name: e.target.value.slice(0, 50) });
                    if (formError) setFormError(null);
                  }}
                  placeholder="Ex. Sciences fortes, Cours communs…"
                  className={[
                    "w-full rounded-xl border bg-[rgb(var(--surface))] px-4 py-2.5 text-[rgb(var(--ink))] outline-none placeholder:text-[rgb(var(--ink-3))] transition-colors",
                    formError
                      ? "border-[rgb(var(--red))]/60 focus:border-[rgb(var(--red))]"
                      : "border-[rgb(var(--border))] focus:border-purple-500",
                  ].join(" ")}
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- form modal organisation: focus immediat sur 1er champ apres ouverture
                  autoFocus
                />
                {formError && (
                  <p className="mt-1.5 text-xs font-bold text-[rgb(var(--red))]">{formError}</p>
                )}
              </div>

              {/* Emoji */}
              <div role="group" aria-labelledby={emojiLabelId}>
                <span id={emojiLabelId} className="mb-2 block text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                  Emoji
                </span>
                <div className="grid grid-cols-8 gap-1.5 mb-2">
                  {PRESET_EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setForm({ ...form, emoji: form.emoji === em ? "" : em })}
                      className={[
                        "flex h-9 w-full items-center justify-center rounded-xl border text-lg transition-all duration-150",
                        form.emoji === em
                          ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/15 ring-1 ring-[rgb(var(--accent))]"
                          : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--ink-3))]",
                      ].join(" ")}
                    >
                      {em}
                    </button>
                  ))}
                </div>
                <input
                  id={emojiInputId}
                  aria-label="Emoji personnalisé"
                  type="text"
                  value={form.emoji}
                  onChange={(e) => setForm({ ...form, emoji: e.target.value.trim().slice(0, 8) })}
                  placeholder="Ou colle un emoji ici…"
                  className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--ink))] outline-none placeholder:text-[rgb(var(--ink-3))] focus:border-purple-500"
                />
              </div>

              {/* Couleur */}
              <div role="group" aria-labelledby={colorLabelId}>
                <span id={colorLabelId} className="mb-2 block text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                  Couleur
                </span>
                <div className="flex flex-wrap gap-2">
                  {VALID_COLORS.map((c) => {
                    const cs = COLOR_STYLES[c];
                    const isSelected = form.color === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setForm({ ...form, color: c })}
                        title={c}
                        className={[
                          "h-8 w-8 rounded-full transition-all duration-150",
                          cs.dot,
                          isSelected
                            ? `ring-2 ring-offset-2 ring-offset-[rgb(var(--surface))] ${cs.ring} scale-110`
                            : "hover:scale-105 opacity-70 hover:opacity-100",
                        ].join(" ")}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor={descriptionId} className="text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                    Description <span className="normal-case font-normal text-[rgb(var(--ink-3))]">(optionnel)</span>
                  </label>
                  <span className={`text-xs ${form.description.length > 160 ? "text-[rgb(var(--warm))]" : "text-[rgb(var(--ink-3))]"}`}>
                    {form.description.length}/200
                  </span>
                </div>
                <textarea
                  id={descriptionId}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value.slice(0, 200) })}
                  placeholder="À quoi sert ce tag ? Ex. Pour les classes en filière approfondie…"
                  rows={3}
                  className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm text-[rgb(var(--ink))] outline-none placeholder:text-[rgb(var(--ink-3))] focus:border-purple-500 resize-none"
                />
              </div>
            </div>

            {/* ── Droite : aperçu live ── */}
            <div className="lg:w-64 lg:shrink-0">
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-[rgb(var(--ink-3))]">
                Aperçu live
              </p>
              <TagCard tag={previewTag} isPreview />
              <p className="mt-2 text-[11px] text-[rgb(var(--ink-3))] text-center leading-relaxed">
                Voici à quoi ressemblera ton tag dans la liste.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-between border-t border-[rgb(var(--border))] pt-5">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-2xl border border-[rgb(var(--border))] px-5 py-2.5 font-bold text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))] transition-colors disabled:opacity-40"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="rounded-2xl bg-[rgb(var(--accent))] px-6 py-2.5 font-black text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Sauvegarde…" : mode === "create" ? "Créer ✨" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DeleteModal ───────────────────────────────────────────────────────────────

type DeleteModalProps = {
  state: DeleteState & { kind: "confirm" | "force" };
  deleting: boolean;
  onCancel: () => void;
  onConfirm: (force: boolean) => void;
};

function DeleteModal({ state, deleting, onCancel, onConfirm }: DeleteModalProps) {
  const { tag } = state;
  const s       = COLOR_STYLES[tag.color];
  const isForce = state.kind === "force";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (!deleting && e.target === e.currentTarget) onCancel(); }}
      onKeyDown={(e) => { if (e.key === "Escape" && !deleting) onCancel(); }}
      role="button"
      tabIndex={-1}
      aria-label="Fermer la fenêtre"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-2xl">
        {/* Tag identity */}
        <div className={`mb-5 flex items-center gap-3 rounded-2xl border p-4 ${s.cardBg} ${s.cardBorder}`}>
          <span className="text-2xl">{tag.emoji ?? "🏷️"}</span>
          <div>
            <p className={`font-black ${s.text}`}>{tag.name}</p>
            {tag.description && (
              <p className="text-xs text-[rgb(var(--ink-3))] mt-0.5">{tag.description}</p>
            )}
          </div>
        </div>

        {isForce ? (
          <>
            <h3 className="text-base font-black text-[rgb(var(--ink))]">Ce tag est utilisé</h3>
            <div className="mt-3 space-y-1.5 rounded-xl bg-[rgb(var(--surface))] p-3">
              {tag.usage!.courses   > 0 && <p className="text-sm text-[rgb(var(--ink-2))]">📄 {tag.usage!.courses} cours</p>}
              {tag.usage!.questions > 0 && <p className="text-sm text-[rgb(var(--ink-2))]">❓ {tag.usage!.questions} question{tag.usage!.questions > 1 ? "s" : ""}</p>}
              {tag.usage!.classes   > 0 && <p className="text-sm text-[rgb(var(--ink-2))]">👥 {tag.usage!.classes} classe{tag.usage!.classes > 1 ? "s" : ""}</p>}
            </div>
            <div className="mt-3 rounded-xl border border-[rgb(var(--warm))]/30 bg-[rgb(var(--warm))]/10 px-4 py-3">
              <p className="text-xs font-bold text-[rgb(var(--warm))]">
                ⚠️ La suppression retirera ce tag de toutes ces entités.
              </p>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={onCancel}
                disabled={deleting}
                className="flex-1 rounded-2xl border border-[rgb(var(--border))] py-2.5 font-bold text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))] transition-colors disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                onClick={() => onConfirm(true)}
                disabled={deleting}
                className="flex-1 rounded-2xl bg-[rgb(var(--red))] py-2.5 font-black text-white hover:opacity-90 transition-colors disabled:opacity-40"
              >
                {deleting ? "Suppression…" : "Supprimer quand même"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-base font-black text-[rgb(var(--ink))]">Supprimer ce tag ?</h3>
            <p className="mt-1.5 text-sm text-[rgb(var(--ink-2))]">
              Ce tag n&apos;est pas utilisé. Cette action est irréversible.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={onCancel}
                disabled={deleting}
                className="flex-1 rounded-2xl border border-[rgb(var(--border))] py-2.5 font-bold text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))] transition-colors disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                onClick={() => onConfirm(false)}
                disabled={deleting}
                className="flex-1 rounded-2xl bg-[rgb(var(--red))] py-2.5 font-black text-white hover:opacity-90 transition-colors disabled:opacity-40"
              >
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── OnboardingStep1 ───────────────────────────────────────────────────────────

type OnboardingStep1Props = {
  onContinue: (profiles: ProfileId[]) => void;
  onSkip: () => void;
};

function OnboardingStep1({ onContinue, onSkip }: OnboardingStep1Props) {
  const [selected, setSelected] = useState<Set<ProfileId>>(new Set());
  const MAX = 3;

  function toggle(id: ProfileId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX) {
        next.add(id);
      }
      return next;
    });
  }

  const count = selected.size;

  return (
    <div className="py-8">
      {/* Hero */}
      <div className="mx-auto max-w-xl text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-[rgb(var(--accent))]">
          Étape 1 sur 2
        </p>
        <h2 className="mt-3 text-2xl font-black text-[rgb(var(--ink))]">
          Tu enseignes principalement quoi ?
        </h2>
        <p className="mt-3 text-[rgb(var(--ink-2))] leading-relaxed">
          On va te proposer une organisation qui te correspond.{" "}
          <span className="text-[rgb(var(--ink-3))]">Jusqu&apos;à {MAX} choix.</span>
        </p>
      </div>

      {/* Profile chips */}
      <div className="mx-auto mt-8 max-w-lg grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PROFILE_OPTIONS.map((p, i) => {
          const isSelected = selected.has(p.id);
          const isDisabled = !isSelected && count >= MAX;
          const isLastOdd  = i === PROFILE_OPTIONS.length - 1 && PROFILE_OPTIONS.length % 2 !== 0;

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              disabled={isDisabled}
              className={[
                "flex flex-col items-center gap-2 rounded-2xl border p-5 text-center transition-all duration-200",
                isLastOdd ? "col-span-2 sm:col-span-1 sm:col-start-2" : "",
                isSelected
                  ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10 ring-1 ring-[rgb(var(--accent))]/40 -translate-y-0.5 shadow-lg shadow-[rgb(var(--accent))]/10"
                  : isDisabled
                  ? "border-[rgb(var(--border))] bg-[rgb(var(--surface))]/50 opacity-40 cursor-not-allowed"
                  : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-purple-500/50 hover:-translate-y-0.5 hover:shadow-md",
              ].join(" ")}
            >
              <span className="text-3xl leading-none">{p.emoji}</span>
              <span className={`font-black text-sm leading-tight ${isSelected ? "text-purple-200" : "text-[rgb(var(--ink))]"}`}>
                {p.label}
              </span>
              {p.sublabel && (
                <span className="text-xs text-[rgb(var(--ink-3))] leading-tight">{p.sublabel}</span>
              )}
              {isSelected && (
                <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(var(--accent))] text-[10px] font-black text-white">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mx-auto mt-8 max-w-lg flex flex-col items-center gap-4">
        <button
          onClick={() => onContinue(Array.from(selected))}
          disabled={count === 0}
          className="w-full rounded-2xl bg-[rgb(var(--accent))] px-7 py-3.5 font-black text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {count === 0 ? "Sélectionne au moins un profil" : `Continuer → (${count} choix)`}
        </button>
        <button
          onClick={onSkip}
          className="text-sm text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))] transition-colors"
        >
          Je créerai mes tags plus tard
        </button>
      </div>
    </div>
  );
}

// ── OnboardingStep2 ───────────────────────────────────────────────────────────

type OnboardingStep2Props = {
  profiles: ProfileId[];
  onBack: () => void;
  onSkip: () => void;
  onConfirm: (selected: SuggestionItem[]) => void;
  creating: boolean;
};

function OnboardingStep2({ profiles, onBack, onSkip, onConfirm, creating }: OnboardingStep2Props) {
  const merged = useMemo(() => mergeSuggestions(profiles), [profiles]);

  const [checkedNames, setCheckedNames] = useState<Set<string>>(
    () => new Set(merged.map((s) => s.name.toLowerCase()))
  );

  function toggle(name: string) {
    const key = name.toLowerCase();
    setCheckedNames((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedItems = merged.filter((s) => checkedNames.has(s.name.toLowerCase()));
  const count = selectedItems.length;

  return (
    <div className="py-8">
      <div className="mx-auto max-w-2xl">
        {/* Hero */}
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[rgb(var(--accent))]">
            Étape 2 sur 2
          </p>
          <h2 className="mt-3 text-2xl font-black text-[rgb(var(--ink))]">
            Voici une organisation qui pourrait te servir
          </h2>
          <p className="mt-2 text-[rgb(var(--ink-2))]">{profileSubtitle(profiles)}</p>
          <p className="mt-1 text-xs text-[rgb(var(--ink-3))]">
            Coche ou décoche chaque tag selon tes besoins.
          </p>
        </div>

        {/* Suggestions grid */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {merged.map((s) => {
            const isChecked = checkedNames.has(s.name.toLowerCase());
            const cs = COLOR_STYLES[s.color];

            return (
              <button
                key={s.name}
                type="button"
                onClick={() => toggle(s.name)}
                className={[
                  "relative rounded-2xl border p-4 text-left transition-all duration-200",
                  isChecked
                    ? `${cs.cardBg} ${cs.cardBorder} hover:opacity-90 -translate-y-0 hover:-translate-y-0.5`
                    : "bg-[rgb(var(--surface))] border-[rgb(var(--border))] opacity-50 grayscale hover:opacity-60",
                ].join(" ")}
              >
                {/* Checkbox indicator */}
                <div
                  className={[
                    "absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-black transition-all duration-150",
                    isChecked
                      ? "border-green-500 bg-green-500 text-[rgb(var(--ink))]"
                      : "border-[rgb(var(--border))] bg-transparent text-transparent",
                  ].join(" ")}
                >
                  ✓
                </div>

                <div className="flex items-center gap-2 pr-7">
                  <span className="text-xl leading-none">{s.emoji}</span>
                  <span className={`font-black text-sm ${isChecked ? cs.text : "text-[rgb(var(--ink-2))]"}`}>
                    {s.name}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-[rgb(var(--ink-3))] leading-relaxed">
                  {s.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="flex w-full gap-3">
            <button
              onClick={onBack}
              disabled={creating}
              className="rounded-2xl border border-[rgb(var(--border))] px-5 py-3 font-bold text-[rgb(var(--ink-2))] hover:text-[rgb(var(--ink))] transition-colors disabled:opacity-40"
            >
              ← Retour
            </button>
            <button
              onClick={() => onConfirm(selectedItems)}
              disabled={creating || count === 0}
              className="flex-1 rounded-2xl bg-[rgb(var(--accent))] px-5 py-3 font-black text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {creating
                ? "Création en cours…"
                : count === 0
                ? "Sélectionne au moins un tag"
                : `Créer ${count} tag${count > 1 ? "s" : ""} →`}
            </button>
          </div>
          <button
            onClick={onSkip}
            disabled={creating}
            className="text-sm text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))] transition-colors disabled:opacity-40"
          >
            Je préfère créer mes propres tags
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

type EmptyStateProps = {
  onCreateClick: () => void;
  onBatchCreate: (suggestions: SuggestionItem[]) => void;
  batchCreating: boolean;
};

function EmptyState({ onCreateClick, onBatchCreate, batchCreating }: EmptyStateProps) {
  return (
    <div className="py-8">
      {/* Hero */}
      <div className="mx-auto max-w-xl text-center">
        {/* SVG illustration — tags flottants */}
        <div className="mb-6 flex justify-center">
          <svg width="120" height="80" viewBox="0 0 120 80" fill="none" className="opacity-80">
            <rect x="10" y="28" width="44" height="24" rx="12" fill="#7c3aed" fillOpacity="0.25" />
            <rect x="10" y="28" width="44" height="24" rx="12" stroke="#7c3aed" strokeOpacity="0.5" strokeWidth="1.5" />
            <text x="32" y="44" textAnchor="middle" fontSize="13" fill="#c4b5fd">⚗️</text>

            <rect x="66" y="12" width="44" height="24" rx="12" fill="#1d4ed8" fillOpacity="0.25" />
            <rect x="66" y="12" width="44" height="24" rx="12" stroke="#3b82f6" strokeOpacity="0.5" strokeWidth="1.5" />
            <text x="88" y="28" textAnchor="middle" fontSize="13" fill="#93c5fd">🧪</text>

            <rect x="36" y="56" width="52" height="24" rx="12" fill="#b45309" fillOpacity="0.25" />
            <rect x="36" y="56" width="52" height="24" rx="12" stroke="#f97316" strokeOpacity="0.5" strokeWidth="1.5" />
            <text x="62" y="72" textAnchor="middle" fontSize="13" fill="#fdba74">📚</text>
          </svg>
        </div>

        <h2 className="text-2xl font-black text-[rgb(var(--ink))]">
          Ton organisation, tes règles.
        </h2>
        <p className="mt-3 text-[rgb(var(--ink-2))] leading-relaxed">
          ✨ Crée ta propre organisation. Maïa s&apos;adapte à comment{" "}
          <span className="font-bold text-[rgb(var(--accent))]">TU</span> enseignes, pas l&apos;inverse.
        </p>

        <button
          onClick={onCreateClick}
          className="mt-6 rounded-2xl bg-[rgb(var(--accent))] px-7 py-3.5 font-black text-white hover:opacity-90 transition-colors"
        >
          + Créer mon premier tag
        </button>
      </div>

      {/* Séparateur */}
      <div className="mx-auto mt-10 max-w-2xl">
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-[rgb(var(--border))]" />
          <span className="text-xs font-bold text-[rgb(var(--ink-3))] uppercase tracking-widest">
            Suggestions pour démarrer
          </span>
          <div className="flex-1 border-t border-[rgb(var(--border))]" />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SUGGESTED_TAGS.map((s) => {
            const cs = COLOR_STYLES[s.color];
            return (
              <div
                key={s.name}
                className={`rounded-2xl border p-4 ${cs.cardBg} ${cs.cardBorder}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{s.emoji}</span>
                  <span className={`font-black ${cs.text}`}>{s.name}</span>
                </div>
                <p className="mt-1.5 text-xs text-[rgb(var(--ink-3))]">{s.description}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => onBatchCreate(SUGGESTED_TAGS)}
            disabled={batchCreating}
            className="rounded-2xl border border-[rgb(var(--accent))]/40 bg-[rgb(var(--accent))]/10 px-6 py-2.5 text-sm font-black text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))]/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {batchCreating ? "Création en cours…" : "Créer ces 4 tags d'un coup"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ toast }: { toast: ToastState }) {
  if (!toast) return null;

  const s = toast.color ? COLOR_STYLES[toast.color] : null;

  return (
    <div
      className={[
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl border shadow-xl",
        "animate-slide-up",
        s
          ? `${s.toastBg} ${s.toastBorder} ${s.toastText}`
          : "bg-[rgb(var(--surface-3))]/90 border-[rgb(var(--border))] text-[rgb(var(--ink))]",
      ].join(" ")}
    >
      <p className="text-sm font-bold whitespace-nowrap">{toast.msg}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OrganizationPage() {
  const supabase = useMemo(() => createClient(), []);

  const [isTeacher,     setIsTeacher]     = useState(false);
  const [pageLoading,   setPageLoading]   = useState(true);
  const [tags,          setTags]          = useState<Tag[]>([]);
  const [tagsLoading,   setTagsLoading]   = useState(false);
  const [modal,         setModal]         = useState<ModalMode>({ kind: "closed" });
  const [deleteState,   setDeleteState]   = useState<DeleteState>({ kind: "closed" });
  const [deleting,      setDeleting]      = useState(false);
  const [batchCreating, setBatchCreating] = useState(false);
  const [toast,         setToast]         = useState<ToastState>(null);
  const [emptyView,     setEmptyView]     = useState<EmptyViewMode>({ kind: "onboarding-step1" });

  useEffect(() => {
    async function init() {
      const { data } = await supabase.rpc("is_current_user_school_teacher");
      setIsTeacher(data === true);
      setPageLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isTeacher) return;
    loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher]);

  async function loadTags() {
    setTagsLoading(true);
    try {
      const res  = await fetch("/api/teacher-tags");
      const json = await res.json();
      setTags(json.tags ?? []);
    } catch {
      // silently fail — empty list shown
    }
    setTagsLoading(false);
  }

  function showToast(msg: string, color: TagColor | null, duration = 3500) {
    setToast({ msg, color });
    setTimeout(() => setToast(null), duration);
  }

  // ── Handlers ──

  function handleModalSaved(tag: Tag, isNew: boolean) {
    if (isNew) {
      setTags((prev) => [...prev, { ...tag, usage: { courses: 0, questions: 0, classes: 0 } }]);
    } else {
      setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, ...tag } : t)));
    }
    setModal({ kind: "closed" });
    const emoji = tag.emoji ?? "🏷️";
    showToast(
      isNew ? `✨ ${emoji} ${tag.name} est prêt !` : `✅ ${emoji} ${tag.name} mis à jour`,
      tag.color
    );
  }

  function handleDeleteClick(tag: Tag) {
    const used = totalUsage(tag.usage);
    setDeleteState(used > 0 ? { kind: "force", tag } : { kind: "confirm", tag });
  }

  async function handleDeleteConfirm(force: boolean) {
    if (deleteState.kind === "closed") return;
    const { tag } = deleteState;
    setDeleting(true);

    try {
      const url = `/api/teacher-tags/${tag.id}${force ? "?force=true" : ""}`;
      const res = await fetch(url, { method: "DELETE" });

      if (!res.ok) {
        const json = await res.json();
        showToast(json.error ?? "Erreur lors de la suppression.", null);
        setDeleting(false);
        return;
      }

      setTags((prev) => prev.filter((t) => t.id !== tag.id));
      setDeleteState({ kind: "closed" });
      showToast("Tag supprimé", null);
    } catch {
      showToast("Erreur réseau.", null);
    }

    setDeleting(false);
  }

  async function handleBatchCreate(suggestions: SuggestionItem[]) {
    setBatchCreating(true);
    const results = await Promise.allSettled(
      suggestions.map((s) =>
        fetch("/api/teacher-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: s.name, emoji: s.emoji, color: s.color, description: s.description }),
        }).then((r) => r.json())
      )
    );

    const created: Tag[] = results
      .filter((r): r is PromiseFulfilledResult<{ tag: Tag }> => r.status === "fulfilled" && r.value?.tag)
      .map((r) => ({ ...r.value.tag, usage: { courses: 0, questions: 0, classes: 0 } }));

    if (created.length > 0) {
      setTags((prev) => [...prev, ...created]);
      showToast(`✨ ${created.length} tag${created.length > 1 ? "s" : ""} créé${created.length > 1 ? "s" : ""} !`, "purple");
    }
    setBatchCreating(false);
  }

  // ── Derived ──

  const maxUsage = useMemo(
    () => Math.max(0, ...tags.map((t) => totalUsage(t.usage))),
    [tags]
  );

  const totalOrganized = useMemo(
    () => tags.reduce((acc, t) => acc + t.usage.courses, 0),
    [tags]
  );

  // ── Loading ──

  if (pageLoading) {
    return (
      <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8">
        <div className="mx-auto w-full max-w-5xl space-y-4">
          <SkeletonBlock className="h-4 w-36 mb-8" />
          <SkeletonBlock className="h-8 w-56" />
          <SkeletonBlock className="h-4 w-40" />
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-36" />)}
          </div>
        </div>
      </main>
    );
  }

  if (!isTeacher) {
    return (
      <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8 text-[rgb(var(--ink))]">
        <div className="mx-auto max-w-xl rounded-3xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/10 p-6">
          <h1 className="text-2xl font-black text-[rgb(var(--red))]">Accès refusé</h1>
          <p className="mt-2 text-[rgb(var(--ink-2))]">Cet espace est réservé aux professeurs autorisés.</p>
        </div>
      </main>
    );
  }

  return (
    <>
      {/* Global keyframes */}
      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translate(-50%, 16px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-8 text-[rgb(var(--ink))]">
        <div className="mx-auto w-full max-w-5xl">

          {/* ── Retour ── */}
          <Link
            href="/accueil"
            className="mb-6 inline-block text-sm text-[rgb(var(--ink-2))] transition-colors hover:text-[rgb(var(--accent))]"
          >
            ← Retour au dashboard
          </Link>

          {/* ── Baseline ── */}
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-widest text-[rgb(var(--accent))]">
              ✨ Maïa — Organisation
            </p>
          </div>

          {/* ── Header ── */}
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-black text-[rgb(var(--ink))]">Ton organisation</h1>
              {tags.length > 0 && (
                <p className="mt-1 text-sm text-[rgb(var(--ink-3))]">
                  {tags.length} tag{tags.length > 1 ? "s" : ""}
                  {totalOrganized > 0 && (
                    <> · {totalOrganized} cours organisé{totalOrganized > 1 ? "s" : ""}</>
                  )}
                </p>
              )}
            </div>

            {tags.length > 0 && (
              <div className="flex items-center gap-2">
                {/* View toggle */}
                <div className="flex rounded-xl border border-[rgb(var(--border))] overflow-hidden">
                  <button className="px-3 py-1.5 text-xs font-bold bg-[rgb(var(--surface))] text-[rgb(var(--accent))] border-r border-[rgb(var(--border))]">
                    ☰ Liste
                  </button>
                  <button
                    title="Bientôt disponible"
                    className="px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink-3))] opacity-50 cursor-not-allowed"
                  >
                    ✦ Galaxie
                  </button>
                </div>

                {/* Create CTA */}
                <button
                  onClick={() => setModal({ kind: "create" })}
                  className="rounded-2xl bg-[rgb(var(--accent))] px-4 py-2 text-sm font-black text-white hover:opacity-90 transition-colors"
                >
                  + Créer un tag
                </button>
              </div>
            )}
          </header>

          {/* ── Content ── */}
          <div className="mt-8">
            {tagsLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-36" />)}
              </div>
            ) : tags.length === 0 ? (
              // key forces remount + fade-in on each step transition
              <div key={emptyView.kind} className="animate-fade-in">
                {emptyView.kind === "onboarding-step1" && (
                  <OnboardingStep1
                    onContinue={(profiles) => setEmptyView({ kind: "onboarding-step2", profiles })}
                    onSkip={() => setEmptyView({ kind: "fallback" })}
                  />
                )}
                {emptyView.kind === "onboarding-step2" && (
                  <OnboardingStep2
                    profiles={emptyView.profiles}
                    onBack={() => setEmptyView({ kind: "onboarding-step1" })}
                    onSkip={() => setEmptyView({ kind: "fallback" })}
                    onConfirm={handleBatchCreate}
                    creating={batchCreating}
                  />
                )}
                {emptyView.kind === "fallback" && (
                  <EmptyState
                    onCreateClick={() => setModal({ kind: "create" })}
                    onBatchCreate={handleBatchCreate}
                    batchCreating={batchCreating}
                  />
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {tags.map((tag) => (
                  <TagCard
                    key={tag.id}
                    tag={tag}
                    maxUsage={maxUsage}
                    onEdit={() => setModal({ kind: "edit", tag })}
                    onDelete={() => handleDeleteClick(tag)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Modals ── */}
      {modal.kind !== "closed" && (
        <TagModal
          mode={modal.kind === "create" ? "create" : "edit"}
          initialTag={modal.kind === "edit" ? modal.tag : undefined}
          onClose={() => setModal({ kind: "closed" })}
          onSaved={handleModalSaved}
        />
      )}

      {(deleteState.kind === "confirm" || deleteState.kind === "force") && (
        <DeleteModal
          state={deleteState}
          deleting={deleting}
          onCancel={() => setDeleteState({ kind: "closed" })}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {/* ── Toast ── */}
      <Toast toast={toast} />
    </>
  );
}
