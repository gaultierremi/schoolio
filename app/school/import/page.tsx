"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SchoolLevel } from "@/lib/subjects";
import GenerationProgress from "./_components/GenerationProgress";

// ── Types ─────────────────────────────────────────────────────────────────────

type FileStatus =
  | "pending"
  | "hashing"
  | "uploading"
  | "inferring"
  | "ready"
  | "validated"
  | "generating"
  | "generated"
  | "error";

type CourseSubject =
  | "chimie"
  | "physique"
  | "biologie"
  | "mathematiques"
  | "histoire"
  | "geographie"
  | "francais"
  | "anglais"
  | "neerlandais"
  | "autre";

type Inference = {
  subject: CourseSubject;
  level: SchoolLevel | null;
  title: string;
  confidence: number;
};

type FileItem = {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  hash: string | null;
  courseId: string | null;
  jobId: string | null;
  storagePath: string | null;
  inference: Inference | null;
  editSubject: CourseSubject;
  editLevel: SchoolLevel | null;
  editTitle: string;
  editing: boolean;
  error: string | null;
  retryFrom: "start" | "upload" | "infer" | null;
  organizationTagIds: string[];
};

type GenProgress = { done: number; total: number; failed: number };

// State for the Gemini sequential queue UI banner
type GeminiQueueState = {
  done: number;
  total: number;
  countdown: number; // >0 = waiting, 0 = actively processing
} | null;

const VALID_COLORS = ["purple", "blue", "red", "orange", "green", "yellow", "pink", "gray"] as const;
type TagColor = (typeof VALID_COLORS)[number];

type TeacherTag = {
  id: string;
  name: string;
  emoji: string | null;
  color: TagColor;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeFilenameForStorage(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  const name = dotIndex !== -1 ? filename.slice(0, dotIndex) : filename;
  const ext = dotIndex !== -1 ? filename.slice(dotIndex) : "";
  // NFD decomposes accented chars into base + combining diacritic; strip the diacritics
  const sanitized = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 \-_.]/g, "_");
  return sanitized + ext;
}

async function sha256hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function xhrUpload(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload échoué: HTTP ${xhr.status}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Erreur réseau lors de l'upload")));
    xhr.send(file);
  });
}

async function runWithPool(
  tasks: (() => Promise<void>)[],
  concurrency: number
): Promise<void> {
  const queue = [...tasks];
  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) await task();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  );
}

const SUBJECT_LABELS: Record<CourseSubject, string> = {
  chimie: "Chimie",
  physique: "Physique",
  biologie: "Biologie",
  mathematiques: "Mathématiques",
  histoire: "Histoire",
  geographie: "Géographie",
  francais: "Français",
  anglais: "Anglais",
  neerlandais: "Néerlandais",
  autre: "Autre",
};

const SUBJECT_OPTIONS: CourseSubject[] = [
  "chimie", "physique", "biologie", "mathematiques", "histoire",
  "geographie", "francais", "anglais", "neerlandais", "autre",
];

// Tag chips : palette pastel (light theme)
const TAG_CHIP_STYLES: Record<TagColor, { base: string; selected: string }> = {
  purple: { base: "bg-purple-50 text-purple-700 border-purple-200",       selected: "bg-purple-200 text-purple-800 border-purple-400 ring-1 ring-purple-400" },
  blue:   { base: "bg-blue-50 text-blue-700 border-blue-200",             selected: "bg-blue-200 text-blue-800 border-blue-400 ring-1 ring-blue-400" },
  red:    { base: "bg-red-50 text-red-700 border-red-200",                 selected: "bg-red-200 text-red-800 border-red-400 ring-1 ring-red-400" },
  orange: { base: "bg-orange-50 text-orange-700 border-orange-200",       selected: "bg-orange-200 text-orange-800 border-orange-400 ring-1 ring-orange-400" },
  green:  { base: "bg-green-50 text-green-700 border-green-200",          selected: "bg-green-200 text-green-800 border-green-400 ring-1 ring-green-400" },
  yellow: { base: "bg-yellow-50 text-yellow-800 border-yellow-200",       selected: "bg-yellow-200 text-yellow-900 border-yellow-400 ring-1 ring-yellow-400" },
  pink:   { base: "bg-pink-50 text-pink-700 border-pink-200",             selected: "bg-pink-200 text-pink-800 border-pink-400 ring-1 ring-pink-400" },
  gray:   { base: "bg-[rgb(var(--surface-3))] text-[rgb(var(--ink-2))] border-[rgb(var(--border))]", selected: "bg-[rgb(var(--ink-3))]/20 text-[rgb(var(--ink))] border-[rgb(var(--ink-3))] ring-1 ring-[rgb(var(--ink-3))]" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-[rgb(var(--accent))]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

type TagPickerProps = {
  tags: TeacherTag[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
};

function TagPicker({ tags, loading, selectedIds, onToggle }: TagPickerProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-[rgb(var(--ink-3))]">
        <Spinner />
        Chargement des tags…
      </div>
    );
  }

  if (tags.length === 0) {
    return (
      <p className="text-xs text-[rgb(var(--ink-2))]">
        Pas encore de tags —{" "}
        <Link href="/school/organization" className="text-[rgb(var(--accent))] underline underline-offset-2 transition-colors hover:opacity-80">
          crée tes premiers tags
        </Link>{" "}
        pour organiser tes cours.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--ink-3))]">Tags d&apos;organisation</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selectedIds.has(tag.id);
          const styles = TAG_CHIP_STYLES[tag.color];
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onToggle(tag.id)}
              className={["flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all", isSelected ? styles.selected : styles.base].join(" ")}
            >
              {tag.emoji && <span>{tag.emoji}</span>}
              {tag.name}
              {isSelected && (
                <svg className="ml-0.5 h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type DropZoneProps = { onFiles: (files: File[]) => void; disabled: boolean };

function DropZone({ onFiles, disabled }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
      if (files.length) onFiles(files);
    },
    [disabled, onFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
      if (files.length) onFiles(files);
      e.target.value = "";
    },
    [onFiles]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={[
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 transition-colors",
        dragging ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/5" : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--accent))]/60",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      <svg className="h-10 w-10 text-[rgb(var(--accent))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <p className="text-center text-sm text-[rgb(var(--ink))]">
        Glissez vos PDF ici ou <span className="font-medium text-[rgb(var(--accent))]">cliquez pour parcourir</span>
      </p>
      <p className="text-xs text-[rgb(var(--ink-3))]">Formats acceptés : PDF · Max 50 MB par fichier</p>
      <input ref={inputRef} type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={handleChange} />
    </div>
  );
}

type InlineEditorProps = {
  item: FileItem;
  onSubject: (v: CourseSubject) => void;
  onLevel: (v: SchoolLevel | null) => void;
  onTitle: (v: string) => void;
  onValidate: () => void;
};

function InlineEditor({ item, onSubject, onLevel, onTitle, onValidate }: InlineEditorProps) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select
        value={item.editSubject}
        onChange={(e) => onSubject(e.target.value as CourseSubject)}
        className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1 text-xs text-[rgb(var(--ink))] focus:border-[rgb(var(--accent))] focus:outline-none"
      >
        {SUBJECT_OPTIONS.map((s) => (
          <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>
        ))}
      </select>
      <select
        value={item.editLevel ?? ""}
        onChange={(e) => onLevel(e.target.value ? (Number(e.target.value) as SchoolLevel) : null)}
        className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1 text-xs text-[rgb(var(--ink))] focus:border-[rgb(var(--accent))] focus:outline-none"
      >
        <option value="">Niveau ?</option>
        {[1, 2, 3, 4, 5, 6].map((l) => (
          <option key={l} value={l}>{l}e année</option>
        ))}
      </select>
      <input
        value={item.editTitle}
        onChange={(e) => onTitle(e.target.value.slice(0, 60))}
        maxLength={60}
        placeholder="Titre du cours"
        className="min-w-[160px] flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1 text-xs text-[rgb(var(--ink))] placeholder:text-[rgb(var(--ink-3))] focus:border-[rgb(var(--accent))] focus:outline-none"
      />
      <button
        onClick={onValidate}
        disabled={!item.editTitle.trim()}
        className="rounded-lg bg-[rgb(var(--accent))] px-3 py-1 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Valider
      </button>
    </div>
  );
}

type FileRowProps = {
  item: FileItem;
  onRetry: (id: string) => void;
  onToggleEdit: (id: string) => void;
  onSubject: (id: string, v: CourseSubject) => void;
  onLevel: (id: string, v: SchoolLevel | null) => void;
  onTitle: (id: string, v: string) => void;
  onValidate: (id: string) => void;
};

function FileRow({ item, onRetry, onToggleEdit, onSubject, onLevel, onTitle, onValidate }: FileRowProps) {
  const statusIcon: Record<FileStatus, React.ReactNode> = {
    pending:   <span className="text-xs text-[rgb(var(--ink-3))]">En attente</span>,
    hashing:   <span className="flex items-center gap-1 text-xs text-[rgb(var(--ink-2))]"><Spinner />Calcul hash…</span>,
    uploading: <span className="flex items-center gap-1 text-xs text-[rgb(var(--ink-2))]"><Spinner />Upload {item.progress}%</span>,
    inferring: <span className="flex items-center gap-1 text-xs text-[rgb(var(--ink-2))]"><Spinner />Analyse Maïa…</span>,
    ready:     null,
    validated: (
      <span className="flex items-center gap-1 text-xs text-[rgb(var(--green))]">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Validé
      </span>
    ),
    generating: <span className="flex items-center gap-1 text-xs text-[rgb(var(--accent))]"><Spinner />Génération…</span>,
    generated: (
      <span className="flex items-center gap-1 text-xs text-[rgb(var(--green))]">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Questions générées
      </span>
    ),
    error: (
      <button onClick={() => onRetry(item.id)} className="flex items-center gap-1 text-xs text-[rgb(var(--red))] transition-colors hover:opacity-80">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Réessayer
      </button>
    ),
  };

  return (
    <div className="flex min-h-[60px] flex-col gap-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex-1 truncate text-sm text-[rgb(var(--ink))]">{item.file.name}</span>
        <div className="shrink-0">{statusIcon[item.status]}</div>
      </div>

      {item.status === "uploading" && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-[rgb(var(--border))]">
          <div className="h-full bg-[rgb(var(--accent))] transition-all duration-200" style={{ width: `${item.progress}%` }} />
        </div>
      )}

      {item.status === "error" && item.error && (
        <p className="text-xs text-[rgb(var(--red))]/80">{item.error}</p>
      )}

      {(item.status === "ready" || (item.status === "validated" && item.editing)) && item.inference && (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-[rgb(var(--ink-2))]">
            <button
              onClick={() => onToggleEdit(item.id)}
              className="text-[rgb(var(--accent))] underline underline-offset-2 transition-colors hover:opacity-80"
            >
              {item.editing ? "Annuler" : "Modifier matière/niveau/titre"}
            </button>
          </p>
          {item.editing ? (
            <InlineEditor
              item={item}
              onSubject={(v) => onSubject(item.id, v)}
              onLevel={(v) => onLevel(item.id, v)}
              onTitle={(v) => onTitle(item.id, v)}
              onValidate={() => onValidate(item.id)}
            />
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[rgb(var(--accent))]/10 px-2 py-0.5 text-xs text-[rgb(var(--accent))]">
                {SUBJECT_LABELS[item.editSubject]}
              </span>
              {item.editLevel && (
                <span className="rounded-full bg-[rgb(var(--surface-3))] px-2 py-0.5 text-xs text-[rgb(var(--ink-2))]">{item.editLevel}e année</span>
              )}
              <span className="text-xs font-medium text-[rgb(var(--ink))]">{item.editTitle}</span>
              {item.status === "ready" && (
                <button
                  onClick={() => onValidate(item.id)}
                  className="ml-auto rounded-lg bg-[rgb(var(--accent))] px-3 py-1 text-xs font-medium text-white transition-colors hover:opacity-90"
                >
                  Valider
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {item.status === "validated" && !item.editing && (
        <p className="text-xs text-[rgb(var(--ink-2))]">
          {SUBJECT_LABELS[item.editSubject]}
          {item.editLevel ? ` · ${item.editLevel}e année` : ""}
          {" · "}
          {item.editTitle}
        </p>
      )}
    </div>
  );
}

// ── GeminiQueueBanner ─────────────────────────────────────────────────────────

function GeminiQueueBanner({ state }: { state: NonNullable<GeminiQueueState> }) {
  const { done, total, countdown } = state;
  const current = Math.min(done + 1, total);
  const remaining = total - done - (countdown === 0 ? 1 : 0);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[rgb(var(--accent))]/20 bg-[rgb(var(--accent))]/5 px-4 py-2.5">
      <div className="flex w-6 shrink-0 justify-center">
        {countdown > 0 ? (
          <span className="font-mono text-xs tabular-nums text-[rgb(var(--accent))]">{countdown}s</span>
        ) : (
          <Spinner />
        )}
      </div>
      <p className="text-xs text-[rgb(var(--ink-2))]">
        {countdown > 0 ? (
          <>
            En attente — prochain dans{" "}
            <span className="font-medium text-[rgb(var(--ink))]">{countdown}s</span>
          </>
        ) : (
          <>
            Analyse Maïa{" "}
            <span className="font-medium text-[rgb(var(--ink))]">{current}/{total}</span>
          </>
        )}
        {remaining > 0 && (
          <span className="ml-2 text-[rgb(var(--ink-3))]">
            · {remaining} restant{remaining > 1 ? "s" : ""}
          </span>
        )}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [items, setItems] = useState<FileItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Upfront defaults : matière + niveau obligatoires AVANT upload.
  // Évite des appels Claude inutiles pour inférer ces champs quand le prof
  // les connaît déjà, et donne à Maïa un signal fort pour mieux nommer
  // le titre du cours.
  const [defaultSubject, setDefaultSubject] = useState<CourseSubject | "">("");
  const [defaultLevel, setDefaultLevel] = useState<SchoolLevel | null>(null);
  const upfrontReady = defaultSubject !== "" && defaultLevel !== null;

  // Tag picker state
  const [teacherTags, setTeacherTags] = useState<TeacherTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [tagsLoading, setTagsLoading] = useState(true);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<GenProgress>({ done: 0, total: 0, failed: 0 });
  const [genDone, setGenDone] = useState(false);
  const [totalQGenerated, setTotalQGenerated] = useState(0);

  // Gemini sequential queue state
  const [geminiQueueState, setGeminiQueueState] = useState<GeminiQueueState>(null);
  const geminiQueueRef = useRef<Array<{ id: string; courseId: string }>>([]);
  const geminiRunningRef = useRef(false);
  const lastGeminiEndRef = useRef(0);  // timestamp of last Gemini call completion
  const geminiDoneRef = useRef(0);     // how many Gemini calls completed (success or error)
  const geminiTotalRef = useRef(0);    // how many Gemini calls scheduled total

  useEffect(() => {
    fetch("/api/teacher-tags")
      .then((r) => r.json())
      .then((data: { tags?: TeacherTag[] }) => {
        if (Array.isArray(data.tags)) setTeacherTags(data.tags);
      })
      .catch(() => {})
      .finally(() => setTagsLoading(false));
  }, []);

  function patchItem(id: string, patch: Partial<FileItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  // ── Gemini rate-limited queue ──────────────────────────────────────────────

  // Waits `ms` ms while updating the countdown in UI every second.
  function waitWithCountdown(ms: number): Promise<void> {
    return new Promise((resolve) => {
      let remaining = Math.ceil(ms / 1000);
      setGeminiQueueState((prev) => (prev ? { ...prev, countdown: remaining } : null));

      const interval = setInterval(() => {
        remaining -= 1;
        setGeminiQueueState((prev) => (prev ? { ...prev, countdown: Math.max(0, remaining) } : null));
        if (remaining <= 0) {
          clearInterval(interval);
          resolve();
        }
      }, 1000);

      // Hard timeout in case interval fires late
      setTimeout(() => { clearInterval(interval); resolve(); }, ms + 100);
    });
  }

  // Performs ONE Gemini infer call. Returns "success", "rate-limit", or "error".
  async function doInferAttempt(id: string, courseId: string): Promise<"success" | "rate-limit" | "error"> {
    patchItem(id, { status: "inferring" });
    try {
      const res = await fetch("/api/courses/infer-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const data = (await res.json()) as { success?: boolean; inference?: Inference; error?: string };

      if (res.status === 503 || (typeof data.error === "string" && /satur|rate.?limit/i.test(data.error))) {
        return "rate-limit";
      }

      if (!res.ok || !data.inference) {
        patchItem(id, {
          status: "error",
          error: data.error ?? "Erreur lors de l'analyse Maïa",
          retryFrom: "infer",
        });
        return "error";
      }

      const inf = data.inference;
      patchItem(id, {
        status: "ready",
        inference: inf,
        editSubject: inf.subject,
        editLevel: inf.level,
        editTitle: inf.title,
        error: null,
        retryFrom: "infer",
      });
      return "success";
    } catch (err) {
      patchItem(id, {
        status: "error",
        error: err instanceof Error ? err.message : "Erreur inconnue",
        retryFrom: "infer",
      });
      return "error";
    }
  }

  // Sequential queue worker
  async function runGeminiQueue() {
    if (geminiRunningRef.current) return;
    geminiRunningRef.current = true;

    while (geminiQueueRef.current.length > 0) {
      const task = geminiQueueRef.current.shift()!;
      const { id, courseId } = task;

      if (lastGeminiEndRef.current > 0) {
        const elapsed = Date.now() - lastGeminiEndRef.current;
        const waitMs = Math.max(0, 15000 - elapsed);
        if (waitMs > 0) {
          await waitWithCountdown(waitMs);
        }
      }

      setGeminiQueueState({
        done: geminiDoneRef.current,
        total: geminiTotalRef.current,
        countdown: 0,
      });

      const result1 = await doInferAttempt(id, courseId);
      lastGeminiEndRef.current = Date.now();

      if (result1 === "rate-limit") {
        patchItem(id, { status: "inferring" });
        await waitWithCountdown(30000);

        setGeminiQueueState((prev) => (prev ? { ...prev, countdown: 0 } : null));

        const result2 = await doInferAttempt(id, courseId);
        lastGeminiEndRef.current = Date.now();

        if (result2 === "rate-limit") {
          patchItem(id, {
            status: "error",
            error: "Limite Gemini dépassée — réessaie dans 1 minute",
            retryFrom: "infer",
          });
        }
      }

      geminiDoneRef.current += 1;

      setGeminiQueueState({
        done: geminiDoneRef.current,
        total: geminiTotalRef.current,
        countdown: 0,
      });
    }

    geminiRunningRef.current = false;

    setTimeout(() => {
      setGeminiQueueState(null);
      geminiDoneRef.current = 0;
      geminiTotalRef.current = 0;
    }, 2000);
  }

  function scheduleInfer(id: string, courseId: string) {
    geminiTotalRef.current += 1;
    geminiQueueRef.current.push({ id, courseId });
    setGeminiQueueState((prev) => ({
      done: geminiDoneRef.current,
      total: geminiTotalRef.current,
      countdown: prev?.countdown ?? 0,
    }));
    runGeminiQueue();
  }

  // ── Upload + infer pipeline ────────────────────────────────────────────────

  async function doUploadAndInfer(id: string, file: File, uploadUrl: string, courseId: string) {
    patchItem(id, { status: "uploading", progress: 0 });
    try {
      await xhrUpload(uploadUrl, file, (pct) => patchItem(id, { progress: pct }));
      scheduleInfer(id, courseId);
    } catch (err) {
      patchItem(id, {
        status: "error",
        error: err instanceof Error ? err.message : "Erreur upload",
        retryFrom: "upload",
      });
    }
  }

  async function processFile(id: string, file: File, orgTagIds: string[] = []) {
    patchItem(id, { status: "hashing" });
    let hash: string;
    try {
      hash = await sha256hex(file);
    } catch {
      patchItem(id, { status: "error", error: "Impossible de calculer le hash du fichier", retryFrom: "start" });
      return;
    }
    patchItem(id, { hash });

    try {
      const res = await fetch("/api/courses/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: sanitizeFilenameForStorage(file.name),
          fileSize: file.size,
          fileHash: hash,
          organization_tags: orgTagIds,
        }),
      });
      const data = (await res.json()) as {
        reused?: boolean;
        courseId?: string;
        inference?: Inference;
        uploadUrl?: string;
        storagePath?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la préparation de l'upload");

      if (data.reused && data.courseId && data.inference) {
        patchItem(id, {
          status: "ready",
          courseId: data.courseId,
          inference: data.inference,
          editSubject: data.inference.subject as CourseSubject,
          editLevel: data.inference.level,
          editTitle: data.inference.title,
          error: null,
          retryFrom: null,
        });
        return;
      }

      if (!data.courseId || !data.uploadUrl || !data.storagePath) {
        throw new Error("Réponse serveur invalide");
      }

      patchItem(id, { courseId: data.courseId, storagePath: data.storagePath, retryFrom: "upload" });
      await doUploadAndInfer(id, file, data.uploadUrl, data.courseId);
    } catch (err) {
      patchItem(id, {
        status: "error",
        error: err instanceof Error ? err.message : "Erreur serveur",
        retryFrom: "start",
      });
    }
  }

  async function retryItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    if (item.retryFrom === "infer" && item.courseId) {
      scheduleInfer(id, item.courseId);
    } else if (item.retryFrom === "upload" && item.courseId) {
      try {
        const res = await fetch("/api/courses/reupload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: item.courseId }),
        });
        const data = (await res.json()) as { uploadUrl?: string; storagePath?: string; error?: string };
        if (!res.ok || !data.uploadUrl) throw new Error(data.error ?? "Impossible de régénérer le lien");
        await doUploadAndInfer(id, item.file, data.uploadUrl, item.courseId);
      } catch (err) {
        patchItem(id, {
          status: "error",
          error: err instanceof Error ? err.message : "Erreur réessai",
        });
      }
    } else {
      await processFile(id, item.file, item.organizationTagIds);
    }
  }

  // ── Generation pipeline ────────────────────────────────────────────────────

  async function runGeneration() {
    const toGenerate = items.filter((i) => i.status === "validated" && i.courseId !== null);
    if (!toGenerate.length) return;

    setIsGenerating(true);
    setGenDone(false);
    setGenProgress({ done: 0, total: toGenerate.length, failed: 0 });

    let totalQ = 0;

    const tasks = toGenerate.map((item) => async () => {
      patchItem(item.id, { status: "generating" });
      try {
        const res = await fetch("/api/courses/generate-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: item.courseId }),
        });
        const data = (await res.json()) as {
          jobId?: string;
          success?: boolean;
          questionsGenerated?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Erreur de génération");

        if (data.jobId) {
          patchItem(item.id, { jobId: data.jobId });
        } else {
          if (!data.success) throw new Error(data.error ?? "Erreur de génération");
          patchItem(item.id, { status: "generated" });
          totalQ += data.questionsGenerated ?? 0;
          setGenProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      } catch (err) {
        patchItem(item.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Erreur de génération",
        });
        setGenProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
      }
    });

    await runWithPool(tasks, 3);

    setItems((prev) => {
      const anyPolling = prev.some((i) => i.status === "generating" && i.jobId !== null);
      if (!anyPolling) {
        setIsGenerating(false);
        setGenDone(true);
        setTotalQGenerated(totalQ);
      }
      return prev;
    });
  }

  // ── Async job completion handlers ─────────────────────────────────────────

  function handleJobComplete(itemId: string, questionsInserted: number) {
    setTotalQGenerated((prev) => prev + questionsInserted);
    setGenProgress((p) => ({ ...p, done: p.done + 1 }));
    setItems((prev) => {
      const next = prev.map((i) =>
        i.id === itemId ? { ...i, status: "generated" as const, jobId: null } : i
      );
      const anyStillPolling = next.some((i) => i.status === "generating" && i.jobId !== null);
      if (!anyStillPolling) {
        Promise.resolve().then(() => {
          setIsGenerating(false);
          setGenDone(true);
        });
      }
      return next;
    });
  }

  function handleJobError(itemId: string, msg: string) {
    setGenProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
    setItems((prev) => {
      const next = prev.map((i) =>
        i.id === itemId ? { ...i, status: "error" as const, error: msg, jobId: null } : i
      );
      const anyStillPolling = next.some((i) => i.status === "generating" && i.jobId !== null);
      if (!anyStillPolling) {
        Promise.resolve().then(() => {
          setIsGenerating(false);
          setGenDone(true);
        });
      }
      return next;
    });
  }

  // ── File addition ──────────────────────────────────────────────────────────

  function addFiles(files: File[]) {
    const orgTagIds = Array.from(selectedTagIds);

    const newItems: FileItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
      progress: 0,
      hash: null,
      courseId: null,
      jobId: null,
      storagePath: null,
      inference: null,
      editSubject: defaultSubject || "autre",
      editLevel: defaultLevel,
      editTitle: file.name.replace(/\.pdf$/i, "").trim().slice(0, 60),
      editing: false,
      error: null,
      retryFrom: null,
      organizationTagIds: orgTagIds,
    }));

    setItems((prev) => [...prev, ...newItems]);
    for (const item of newItems) {
      processFile(item.id, item.file, orgTagIds);
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleValidate(id: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: "validated", editing: false } : item))
    );
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  const validatedCount = items.filter((i) => i.status === "validated").length;
  const hasActive = items.some((i) =>
    (["hashing", "uploading", "inferring", "generating"] as FileStatus[]).includes(i.status)
  );

  void showToast;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-10 text-[rgb(var(--ink))]">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div>
          <Link href="/school" className="mb-6 inline-block text-sm text-[rgb(var(--ink-2))] transition-colors hover:text-[rgb(var(--accent))]">
            ← Retour au dashboard
          </Link>
          <h1 className="serif text-2xl font-bold text-[rgb(var(--ink))]">Import en masse</h1>
          <p className="mt-1 text-sm text-[rgb(var(--ink-2))]">
            Choisis d&apos;abord la matière et l&apos;année, puis dépose tes PDF.
          </p>
        </div>

        {/* Defaults obligatoires AVANT upload */}
        <div className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--ink-3))]">
            Pour quels cours ?
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-[rgb(var(--ink-2))]">
              Matière <span className="text-[rgb(var(--red))]">*</span>
              <select
                value={defaultSubject}
                onChange={(e) => setDefaultSubject(e.target.value as CourseSubject | "")}
                disabled={isGenerating}
                className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--ink))] focus:border-[rgb(var(--accent))] focus:outline-none disabled:opacity-50"
              >
                <option value="">Choisis une matière…</option>
                {SUBJECT_OPTIONS.map((s) => (
                  <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[rgb(var(--ink-2))]">
              Année d&apos;étude <span className="text-[rgb(var(--red))]">*</span>
              <select
                value={defaultLevel ?? ""}
                onChange={(e) => setDefaultLevel(e.target.value ? (Number(e.target.value) as SchoolLevel) : null)}
                disabled={isGenerating}
                className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--ink))] focus:border-[rgb(var(--accent))] focus:outline-none disabled:opacity-50"
              >
                <option value="">Choisis une année…</option>
                {[1, 2, 3, 4, 5, 6].map((l) => (
                  <option key={l} value={l}>{l}e année secondaire</option>
                ))}
              </select>
            </label>
          </div>
          {!upfrontReady && (
            <p className="text-xs text-[rgb(var(--warm))]">
              Choisis la matière et l&apos;année pour activer le dépôt de PDF.
            </p>
          )}
        </div>

        <TagPicker
          tags={teacherTags}
          loading={tagsLoading}
          selectedIds={selectedTagIds}
          onToggle={toggleTag}
        />

        <DropZone onFiles={addFiles} disabled={isGenerating || !upfrontReady} />

        {geminiQueueState !== null && (
          <GeminiQueueBanner state={geminiQueueState} />
        )}

        {items.length > 0 && (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-0">
                <FileRow
                  item={item}
                  onRetry={retryItem}
                  onToggleEdit={(id) => patchItem(id, { editing: !items.find((i) => i.id === id)?.editing })}
                  onSubject={(id, v) => patchItem(id, { editSubject: v })}
                  onLevel={(id, v) => patchItem(id, { editLevel: v })}
                  onTitle={(id, v) => patchItem(id, { editTitle: v })}
                  onValidate={handleValidate}
                />
                {item.status === "generating" && item.jobId && (
                  <div className="rounded-b-xl border border-t-0 border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-4 pb-3">
                    <GenerationProgress
                      jobId={item.jobId}
                      onComplete={(n) => handleJobComplete(item.id, n)}
                      onError={(msg) => handleJobError(item.id, msg)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Bottom generation banner */}
        {(validatedCount > 0 || isGenerating || genDone) && (
          <div className="rounded-2xl border border-[rgb(var(--accent))]/30 bg-[rgb(var(--accent))]/5 px-5 py-4">

            {isGenerating && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Spinner />
                    <p className="text-sm text-[rgb(var(--ink))]">
                      <span className="font-semibold text-[rgb(var(--ink))]">{genProgress.done}</span>
                      <span className="text-[rgb(var(--ink-3))]">/{genProgress.total}</span>
                      {" "}cours traité{genProgress.done > 1 ? "s" : ""} ·{" "}
                      <span className="text-[rgb(var(--ink-2))]">{genProgress.total > 0 ? Math.round((genProgress.done / genProgress.total) * 100) : 0}%</span>
                    </p>
                  </div>
                  <button disabled className="cursor-not-allowed rounded-xl bg-[rgb(var(--accent))] px-5 py-2 text-sm font-semibold text-white opacity-40">
                    En cours…
                  </button>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--border))]">
                  <div
                    className="h-full bg-gradient-to-r from-[rgb(var(--accent))] to-[rgb(var(--accent-2))] transition-all duration-300"
                    style={{ width: `${genProgress.total > 0 ? (genProgress.done / genProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-[rgb(var(--ink-3))]">
                  Maïa identifie d&apos;abord les chapitres de ton syllabus, puis génère ~10-20 questions par chapitre (QCM, réponse libre, calcul). Les questions sont automatiquement classées par chapitre dans ta bibliothèque. Compter ~1-3 min selon la taille du PDF.
                </p>
              </div>
            )}

            {genDone && !isGenerating && (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[rgb(var(--green))]">
                    ✓ {totalQGenerated} question{totalQGenerated > 1 ? "s" : ""} générée{totalQGenerated > 1 ? "s" : ""}
                    {genProgress.failed > 0 && (
                      <span className="ml-2 font-normal text-[rgb(var(--red))]">
                        · {genProgress.failed} échec{genProgress.failed > 1 ? "s" : ""}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">
                    {genProgress.done - genProgress.failed} cours sur {genProgress.total} traités avec succès
                  </p>
                </div>
                <Link
                  href="/school/questions"
                  className="shrink-0 rounded-xl bg-[rgb(var(--accent))] px-5 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
                >
                  Voir mes questions →
                </Link>
              </div>
            )}

            {!isGenerating && !genDone && validatedCount > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-[rgb(var(--ink))]">
                  <span className="font-semibold text-[rgb(var(--ink))]">{validatedCount}</span> cours prêt
                  {validatedCount > 1 ? "s" : ""} à générer
                </p>
                <button
                  disabled={hasActive}
                  onClick={runGeneration}
                  className="rounded-xl bg-[rgb(var(--accent))] px-5 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Lancer la génération sur {validatedCount} cours
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm text-[rgb(var(--ink))] shadow-xl">
          {toast}
        </div>
      )}
    </main>
  );
}
