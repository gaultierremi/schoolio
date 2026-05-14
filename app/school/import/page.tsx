"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SchoolLevel } from "@/lib/subjects";

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

const TAG_CHIP_STYLES: Record<TagColor, { base: string; selected: string }> = {
  purple: { base: "bg-purple-500/10 text-purple-300 border-purple-500/20", selected: "bg-purple-500/25 text-purple-200 border-purple-400 ring-1 ring-purple-400" },
  blue:   { base: "bg-blue-500/10 text-blue-300 border-blue-500/20",       selected: "bg-blue-500/25 text-blue-200 border-blue-400 ring-1 ring-blue-400" },
  red:    { base: "bg-red-500/10 text-red-300 border-red-500/20",           selected: "bg-red-500/25 text-red-200 border-red-400 ring-1 ring-red-400" },
  orange: { base: "bg-orange-500/10 text-orange-300 border-orange-500/20", selected: "bg-orange-500/25 text-orange-200 border-orange-400 ring-1 ring-orange-400" },
  green:  { base: "bg-green-500/10 text-green-300 border-green-500/20",    selected: "bg-green-500/25 text-green-200 border-green-400 ring-1 ring-green-400" },
  yellow: { base: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20", selected: "bg-yellow-500/25 text-yellow-200 border-yellow-400 ring-1 ring-yellow-400" },
  pink:   { base: "bg-pink-500/10 text-pink-300 border-pink-500/20",       selected: "bg-pink-500/25 text-pink-200 border-pink-400 ring-1 ring-pink-400" },
  gray:   { base: "bg-gray-500/10 text-gray-300 border-gray-500/20",       selected: "bg-gray-500/25 text-gray-200 border-gray-400 ring-1 ring-gray-400" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
      <div className="flex items-center gap-2 text-xs text-white/40">
        <Spinner />
        Chargement des tags…
      </div>
    );
  }

  if (tags.length === 0) {
    return (
      <p className="text-xs text-white/50">
        Pas encore de tags —{" "}
        <Link href="/school/organization" className="text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors">
          crée tes premiers tags
        </Link>{" "}
        pour organiser tes cours.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-white/40 uppercase tracking-wide">Tags d&apos;organisation</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selectedIds.has(tag.id);
          const styles = TAG_CHIP_STYLES[tag.color];
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onToggle(tag.id)}
              className={["flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all", isSelected ? styles.selected : styles.base].join(" ")}
            >
              {tag.emoji && <span>{tag.emoji}</span>}
              {tag.name}
              {isSelected && (
                <svg className="h-3 w-3 ml-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 cursor-pointer transition-colors",
        dragging ? "border-purple-400 bg-purple-500/10" : "border-white/20 hover:border-purple-400/60 bg-white/5",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <svg className="h-10 w-10 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <p className="text-sm text-white/70 text-center">
        Glissez vos PDF ici ou <span className="text-purple-400 font-medium">cliquez pour parcourir</span>
      </p>
      <p className="text-xs text-white/40">Formats acceptés : PDF · Max 50 MB par fichier</p>
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
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <select
        value={item.editSubject}
        onChange={(e) => onSubject(e.target.value as CourseSubject)}
        className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-400"
      >
        {SUBJECT_OPTIONS.map((s) => (
          <option key={s} value={s} className="bg-gray-900">{SUBJECT_LABELS[s]}</option>
        ))}
      </select>
      <select
        value={item.editLevel ?? ""}
        onChange={(e) => onLevel(e.target.value ? (Number(e.target.value) as SchoolLevel) : null)}
        className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-400"
      >
        <option value="" className="bg-gray-900">Niveau ?</option>
        {[1, 2, 3, 4, 5, 6].map((l) => (
          <option key={l} value={l} className="bg-gray-900">{l}e année</option>
        ))}
      </select>
      <input
        value={item.editTitle}
        onChange={(e) => onTitle(e.target.value.slice(0, 60))}
        maxLength={60}
        placeholder="Titre du cours"
        className="flex-1 min-w-[160px] bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs text-white placeholder-white/30 focus:outline-none focus:border-purple-400"
      />
      <button
        onClick={onValidate}
        disabled={!item.editTitle.trim()}
        className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
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
    pending:   <span className="text-white/40 text-xs">En attente</span>,
    hashing:   <span className="flex items-center gap-1 text-white/60 text-xs"><Spinner />Calcul hash…</span>,
    uploading: <span className="flex items-center gap-1 text-white/60 text-xs"><Spinner />Upload {item.progress}%</span>,
    inferring: <span className="flex items-center gap-1 text-white/60 text-xs"><Spinner />Analyse Maïa…</span>,
    ready:     null,
    validated: (
      <span className="flex items-center gap-1 text-green-400 text-xs">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Validé
      </span>
    ),
    generating: <span className="flex items-center gap-1 text-purple-300 text-xs"><Spinner />Génération…</span>,
    generated: (
      <span className="flex items-center gap-1 text-green-400 text-xs">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Questions générées
      </span>
    ),
    error: (
      <button onClick={() => onRetry(item.id)} className="flex items-center gap-1 text-red-400 text-xs hover:text-red-300 transition-colors">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Réessayer
      </button>
    ),
  };

  return (
    <div className="min-h-[60px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-white truncate flex-1">{item.file.name}</span>
        <div className="shrink-0">{statusIcon[item.status]}</div>
      </div>

      {item.status === "uploading" && (
        <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-purple-500 transition-all duration-200" style={{ width: `${item.progress}%` }} />
        </div>
      )}

      {item.status === "error" && item.error && (
        <p className="text-xs text-red-400/80">{item.error}</p>
      )}

      {(item.status === "ready" || (item.status === "validated" && item.editing)) && item.inference && (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-white/50">
            Confiance Maïa : {item.inference.confidence}% ·{" "}
            <button
              onClick={() => onToggleEdit(item.id)}
              className="text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors"
            >
              {item.editing ? "Annuler" : "Modifier"}
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
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs">
                {SUBJECT_LABELS[item.editSubject]}
              </span>
              {item.editLevel && (
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/60 text-xs">{item.editLevel}e année</span>
              )}
              <span className="text-xs text-white/80 font-medium">{item.editTitle}</span>
              {item.status === "ready" && (
                <button
                  onClick={() => onValidate(item.id)}
                  className="ml-auto px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors"
                >
                  Valider
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {item.status === "validated" && !item.editing && (
        <p className="text-xs text-white/50">
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
    <div className="flex items-center gap-3 rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-2.5">
      <div className="shrink-0 w-6 flex justify-center">
        {countdown > 0 ? (
          <span className="text-purple-400 text-xs font-mono tabular-nums">{countdown}s</span>
        ) : (
          <Spinner />
        )}
      </div>
      <p className="text-xs text-white/60">
        {countdown > 0 ? (
          <>
            En attente — prochain dans{" "}
            <span className="text-white font-medium">{countdown}s</span>
          </>
        ) : (
          <>
            Analyse Maïa{" "}
            <span className="text-white font-medium">{current}/{total}</span>
          </>
        )}
        {remaining > 0 && (
          <span className="text-white/30 ml-2">
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
  // Sets item state appropriately on all outcomes except rate-limit (caller handles that).
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

  // Sequential queue worker: enforces 15s gap between Gemini calls, retries 503 once after 30s.
  async function runGeminiQueue() {
    if (geminiRunningRef.current) return;
    geminiRunningRef.current = true;

    while (geminiQueueRef.current.length > 0) {
      const task = geminiQueueRef.current.shift()!;
      const { id, courseId } = task;

      // Enforce 15s minimum gap since last Gemini call
      if (lastGeminiEndRef.current > 0) {
        const elapsed = Date.now() - lastGeminiEndRef.current;
        const waitMs = Math.max(0, 15000 - elapsed);
        if (waitMs > 0) {
          await waitWithCountdown(waitMs);
        }
      }

      // Show "processing" state
      setGeminiQueueState({
        done: geminiDoneRef.current,
        total: geminiTotalRef.current,
        countdown: 0,
      });

      // First attempt
      const result1 = await doInferAttempt(id, courseId);
      lastGeminiEndRef.current = Date.now();

      if (result1 === "rate-limit") {
        // Keep item in "inferring" state, wait 30s then retry
        patchItem(id, { status: "inferring" });
        await waitWithCountdown(30000);

        setGeminiQueueState((prev) => (prev ? { ...prev, countdown: 0 } : null));

        const result2 = await doInferAttempt(id, courseId);
        lastGeminiEndRef.current = Date.now();

        if (result2 === "rate-limit") {
          // Both attempts rate-limited → set error so prof can retry manually
          patchItem(id, {
            status: "error",
            error: "Limite Gemini dépassée — réessaie dans 1 minute",
            retryFrom: "infer",
          });
        }
      }

      geminiDoneRef.current += 1;

      // Update done count; remaining items are still in geminiQueueRef
      setGeminiQueueState({
        done: geminiDoneRef.current,
        total: geminiTotalRef.current,
        countdown: 0,
      });
    }

    geminiRunningRef.current = false;

    // Keep banner visible briefly so the user sees "X/X done", then hide
    setTimeout(() => {
      setGeminiQueueState(null);
      geminiDoneRef.current = 0;
      geminiTotalRef.current = 0;
    }, 2000);
  }

  // Enqueues a Gemini infer call and kicks the queue runner if not already running.
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
      // Enqueue Gemini call — does NOT block here, processed sequentially by the queue
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

      // Cache hit: course + inference already known server-side, no Gemini needed
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
      // Goes through the sequential queue — respects rate limiting
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
        const data = (await res.json()) as { success?: boolean; questionsGenerated?: number; error?: string };
        if (!res.ok || !data.success) throw new Error(data.error ?? "Erreur de génération");
        patchItem(item.id, { status: "generated" });
        totalQ += data.questionsGenerated ?? 0;
        setGenProgress((p) => ({ ...p, done: p.done + 1 }));
      } catch (err) {
        patchItem(item.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Erreur de génération",
        });
        setGenProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
      }
    });

    await runWithPool(tasks, 3);

    setIsGenerating(false);
    setGenDone(true);
    setTotalQGenerated(totalQ);
  }

  // ── File addition ──────────────────────────────────────────────────────────

  function addFiles(files: File[]) {
    // Snapshot tag selection at call time — avoids stale closure in processFile
    const orgTagIds = Array.from(selectedTagIds);

    const newItems: FileItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
      progress: 0,
      hash: null,
      courseId: null,
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
    // Hash + upload can run in parallel; Gemini calls are queued sequentially inside processFile
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

  // ── Derived state ──────────────────────────────────────────────────────────

  const validatedCount = items.filter((i) => i.status === "validated").length;
  const hasActive = items.some((i) =>
    (["hashing", "uploading", "inferring", "generating"] as FileStatus[]).includes(i.status)
  );

  void showToast;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-10">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link href="/school" className="transition-colors mb-6 inline-block text-sm text-gray-400 hover:text-purple-400">
            ← Retour au dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white">Import en masse</h1>
          <p className="text-sm text-white/50 mt-1">
            Choisis d&apos;abord la matière et l&apos;année, puis dépose tes PDF.
          </p>
        </div>

        {/* Defaults obligatoires AVANT upload — Maïa s'en sert pour mieux
            comprendre le contenu et économise des appels d'inférence. */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
            Pour quels cours ?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-white/60 flex flex-col gap-1">
              Matière <span className="text-red-400">*</span>
              <select
                value={defaultSubject}
                onChange={(e) => setDefaultSubject(e.target.value as CourseSubject | "")}
                disabled={isGenerating}
                className="bg-gray-900 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
              >
                <option value="">Choisis une matière…</option>
                {SUBJECT_OPTIONS.map((s) => (
                  <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-white/60 flex flex-col gap-1">
              Année d&apos;étude <span className="text-red-400">*</span>
              <select
                value={defaultLevel ?? ""}
                onChange={(e) => setDefaultLevel(e.target.value ? (Number(e.target.value) as SchoolLevel) : null)}
                disabled={isGenerating}
                className="bg-gray-900 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
              >
                <option value="">Choisis une année…</option>
                {[1, 2, 3, 4, 5, 6].map((l) => (
                  <option key={l} value={l}>{l}e année secondaire</option>
                ))}
              </select>
            </label>
          </div>
          {!upfrontReady && (
            <p className="text-xs text-amber-300">
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

        {/* Gemini queue progress banner */}
        {geminiQueueState !== null && (
          <GeminiQueueBanner state={geminiQueueState} />
        )}

        {items.length > 0 && (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <FileRow
                key={item.id}
                item={item}
                onRetry={retryItem}
                onToggleEdit={(id) => patchItem(id, { editing: !items.find((i) => i.id === id)?.editing })}
                onSubject={(id, v) => patchItem(id, { editSubject: v })}
                onLevel={(id, v) => patchItem(id, { editLevel: v })}
                onTitle={(id, v) => patchItem(id, { editTitle: v })}
                onValidate={handleValidate}
              />
            ))}
          </div>
        )}

        {/* Bottom generation banner */}
        {(validatedCount > 0 || isGenerating || genDone) && (
          <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 px-5 py-4">

            {isGenerating && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Spinner />
                  <p className="text-sm text-white/80">
                    <span className="font-semibold text-white">{genProgress.done}</span>
                    <span className="text-white/50">/{genProgress.total}</span>
                    {" "}cours traité{genProgress.done > 1 ? "s" : ""}…
                  </p>
                </div>
                <button disabled className="px-5 py-2 rounded-xl bg-purple-600 opacity-40 cursor-not-allowed text-white text-sm font-semibold">
                  En cours…
                </button>
              </div>
            )}

            {genDone && !isGenerating && (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-green-400">
                    ✓ {totalQGenerated} question{totalQGenerated > 1 ? "s" : ""} générée{totalQGenerated > 1 ? "s" : ""}
                    {genProgress.failed > 0 && (
                      <span className="ml-2 text-red-400 font-normal">
                        · {genProgress.failed} échec{genProgress.failed > 1 ? "s" : ""}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {genProgress.done - genProgress.failed} cours sur {genProgress.total} traités avec succès
                  </p>
                </div>
                <Link
                  href="/school/questions"
                  className="shrink-0 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
                >
                  Voir mes questions →
                </Link>
              </div>
            )}

            {!isGenerating && !genDone && validatedCount > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-white/80">
                  <span className="font-semibold text-white">{validatedCount}</span> cours prêt
                  {validatedCount > 1 ? "s" : ""} à générer
                </p>
                <button
                  disabled={hasActive}
                  onClick={runGeneration}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
                >
                  Lancer la génération sur {validatedCount} cours
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-gray-800 border border-white/10 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}
    </main>
  );
}
