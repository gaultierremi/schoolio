"use client";

import React, { useCallback, useRef, useState } from "react";
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
  | "cached"
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

type ExistingCourse = {
  id: string;
  title: string;
  subject_enum: CourseSubject | null;
  level: SchoolLevel | null;
  pages_count: number | null;
};

type CachedDecision = "use" | "replace" | null;

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
  existingCourse: ExistingCourse | null;
  cachedDecision: CachedDecision;
  error: string | null;
  retryFrom: "start" | "upload" | "infer" | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  "chimie",
  "physique",
  "biologie",
  "mathematiques",
  "histoire",
  "geographie",
  "francais",
  "anglais",
  "neerlandais",
  "autre",
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-purple-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
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
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.toLowerCase().endsWith(".pdf")
      );
      if (files.length) onFiles(files);
    },
    [disabled, onFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []).filter((f) =>
        f.name.toLowerCase().endsWith(".pdf")
      );
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
        dragging
          ? "border-purple-400 bg-purple-500/10"
          : "border-white/20 hover:border-purple-400/60 bg-white/5",
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
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={handleChange}
      />
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
  onCachedDecision: (id: string, d: "use" | "replace") => void;
};

function FileRow({
  item,
  onRetry,
  onToggleEdit,
  onSubject,
  onLevel,
  onTitle,
  onValidate,
  onCachedDecision,
}: FileRowProps) {
  const statusIcon = {
    pending: <span className="text-white/40 text-xs">En attente</span>,
    hashing: <span className="flex items-center gap-1 text-white/60 text-xs"><Spinner />Calcul hash…</span>,
    uploading: (
      <span className="flex items-center gap-1 text-white/60 text-xs">
        <Spinner />Upload {item.progress}%
      </span>
    ),
    inferring: <span className="flex items-center gap-1 text-white/60 text-xs"><Spinner />Analyse IA…</span>,
    ready: null,
    validated: (
      <span className="flex items-center gap-1 text-green-400 text-xs">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Validé
      </span>
    ),
    cached: null,
    error: (
      <button
        onClick={() => onRetry(item.id)}
        className="flex items-center gap-1 text-red-400 text-xs hover:text-red-300 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Réessayer
      </button>
    ),
  }[item.status];

  return (
    <div className="min-h-[60px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-white truncate flex-1">{item.file.name}</span>
        <div className="shrink-0">{statusIcon}</div>
      </div>

      {item.status === "uploading" && (
        <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-all duration-200"
            style={{ width: `${item.progress}%` }}
          />
        </div>
      )}

      {item.status === "error" && item.error && (
        <p className="text-xs text-red-400/80">{item.error}</p>
      )}

      {item.status === "cached" && item.existingCourse && !item.cachedDecision && (
        <div className="flex flex-col gap-1 mt-1">
          <p className="text-xs text-amber-400/80">
            Ce fichier existe déjà : <span className="font-medium">{item.existingCourse.title}</span>
            {item.existingCourse.subject_enum && ` · ${SUBJECT_LABELS[item.existingCourse.subject_enum]}`}
            {item.existingCourse.level && ` · ${item.existingCourse.level}e année`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onCachedDecision(item.id, "use")}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
            >
              Utiliser l'existant
            </button>
            <button
              onClick={() => onCachedDecision(item.id, "replace")}
              className="px-3 py-1 rounded-lg bg-purple-600/50 hover:bg-purple-600 text-white text-xs transition-colors"
            >
              Remplacer
            </button>
          </div>
        </div>
      )}

      {item.status === "cached" && item.cachedDecision === "use" && (
        <p className="text-xs text-green-400/80">Cours existant conservé.</p>
      )}

      {(item.status === "ready" || (item.status === "validated" && item.editing)) && item.inference && (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-white/50">
            Confiance IA : {item.inference.confidence}% ·{" "}
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
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/60 text-xs">
                  {item.editLevel}e année
                </span>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [items, setItems] = useState<FileItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  function patchItem(id: string, patch: Partial<FileItem>) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ── Pipeline ───────────────────────────────────────────────────────────────

  async function doInfer(id: string, courseId: string) {
    patchItem(id, { status: "inferring" });
    try {
      const res = await fetch("/api/courses/infer-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const data = (await res.json()) as { success?: boolean; inference?: Inference; error?: string };
      if (!res.ok || !data.inference) {
        throw new Error(data.error ?? "Erreur lors de l'analyse IA");
      }
      patchItem(id, {
        status: "ready",
        inference: data.inference,
        editSubject: data.inference.subject,
        editLevel: data.inference.level,
        editTitle: data.inference.title,
        error: null,
        retryFrom: "infer",
      });
    } catch (err) {
      patchItem(id, {
        status: "error",
        error: err instanceof Error ? err.message : "Erreur inconnue",
        retryFrom: "infer",
      });
    }
  }

  async function doUploadAndInfer(
    id: string,
    file: File,
    uploadUrl: string,
    courseId: string
  ) {
    patchItem(id, { status: "uploading", progress: 0 });
    try {
      await xhrUpload(uploadUrl, file, (pct) => patchItem(id, { progress: pct }));
      await doInfer(id, courseId);
    } catch (err) {
      patchItem(id, {
        status: "error",
        error: err instanceof Error ? err.message : "Erreur upload",
        retryFrom: "upload",
      });
    }
  }

  async function processFile(id: string, file: File) {
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
        body: JSON.stringify({ filename: file.name, fileSize: file.size, fileHash: hash }),
      });
      const data = (await res.json()) as {
        cached?: boolean;
        existingCourse?: ExistingCourse;
        courseId?: string;
        uploadUrl?: string;
        storagePath?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la préparation de l'upload");

      if (data.cached && data.existingCourse) {
        patchItem(id, { status: "cached", existingCourse: data.existingCourse });
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
      await doInfer(id, item.courseId);
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
      await processFile(id, item.file);
    }
  }

  // ── File addition ──────────────────────────────────────────────────────────

  function addFiles(files: File[]) {
    const newItems: FileItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
      progress: 0,
      hash: null,
      courseId: null,
      storagePath: null,
      inference: null,
      editSubject: "autre",
      editLevel: null,
      editTitle: file.name.replace(/\.pdf$/i, "").trim().slice(0, 60),
      editing: false,
      existingCourse: null,
      cachedDecision: null,
      error: null,
      retryFrom: null,
    }));

    setItems((prev) => [...prev, ...newItems]);

    for (const item of newItems) {
      processFile(item.id, item.file);
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleValidate(id: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: "validated", editing: false }
          : item
      )
    );
  }

  function handleCachedDecision(id: string, decision: "use" | "replace") {
    if (decision === "use") {
      patchItem(id, { cachedDecision: "use" });
    } else {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      patchItem(id, { cachedDecision: "replace", status: "pending", existingCourse: null, hash: null });
      processFile(id, item.file);
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const validatedCount = items.filter((i) => i.status === "validated").length;
  const hasActive = items.some((i) =>
    ["hashing", "uploading", "inferring"].includes(i.status)
  );

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-10">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            href="/school"
            className="transition-colors mb-6 inline-block text-sm text-gray-400 hover:text-purple-400"
          >
            ← Retour au dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white">Import en masse</h1>
          <p className="text-sm text-white/50 mt-1">
            Déposez vos PDF — l'IA détecte automatiquement matière, niveau et titre.
          </p>
        </div>

        <DropZone onFiles={addFiles} disabled={false} />

        {items.length > 0 && (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <FileRow
                key={item.id}
                item={item}
                onRetry={retryItem}
                onToggleEdit={(id) =>
                  patchItem(id, { editing: !items.find((i) => i.id === id)?.editing })
                }
                onSubject={(id, v) => patchItem(id, { editSubject: v })}
                onLevel={(id, v) => patchItem(id, { editLevel: v })}
                onTitle={(id, v) => patchItem(id, { editTitle: v })}
                onValidate={handleValidate}
                onCachedDecision={handleCachedDecision}
              />
            ))}
          </div>
        )}

        {validatedCount > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-purple-500/30 bg-purple-500/10 px-5 py-4">
            <p className="text-sm text-white/80">
              <span className="font-semibold text-white">{validatedCount}</span> cours prêt
              {validatedCount > 1 ? "s" : ""} à publier
            </p>
            <button
              disabled={hasActive}
              onClick={() => showToast("Fonctionnalité bientôt disponible !")}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              Lancer
            </button>
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
