"use client";

import { useRef, useState } from "react";
import type { PdfStats } from "../_types";

export function PdfUploadZone({
  loading,
  error,
  warning,
  progress,
  pdfStats,
  onFile,
}: {
  loading: boolean;
  error: string | null;
  warning: string | null;
  progress: number;
  pdfStats: PdfStats | null;
  onFile: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === "application/pdf") onFile(file);
  }

  return (
    <div className="space-y-4">
      <p className="text-[rgb(var(--ink-2))]">
        Dépose un PDF de cours et Maïa génère des questions avec détection
        automatique de la période historique.
      </p>

      {warning && !loading && (
        <div className="rounded-2xl border border-[rgb(var(--warm))]/30 bg-[rgb(var(--warm))]/10 p-4 text-sm font-bold text-[rgb(var(--warm))]">
          ⚠️ {warning}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !loading && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-12 transition ${
          dragging
            ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/5"
            : loading
            ? "cursor-default border-[rgb(var(--border))]"
            : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--accent))]/50"
        }`}
      >
        {loading ? (
          <>
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[rgb(var(--border))] border-t-[rgb(var(--accent))]" />
            <p className="mt-4 font-bold text-[rgb(var(--accent))]">Analyse en cours…</p>
            <div className="mt-4 w-full max-w-xs">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--border))]">
                <div
                  className="h-full rounded-full bg-[rgb(var(--accent))] transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-center text-xs text-[rgb(var(--ink-3))]">{progress}%</p>
            </div>
            <p className="mt-2 text-sm text-[rgb(var(--ink-3))]">
              Cela peut prendre jusqu&apos;à 60 secondes
            </p>
          </>
        ) : (
          <>
            <span className="text-5xl">📄</span>
            <p className="mt-4 font-black text-[rgb(var(--ink))]">Dépose ton PDF ici</p>
            <p className="mt-1 text-sm text-[rgb(var(--ink-3))]">
              ou clique pour parcourir · max 8 Mo
            </p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />

      {pdfStats && !loading && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
          {pdfStats.fromCache && (
            <span className="rounded-full bg-[rgb(var(--green))]/10 px-3 py-1 text-xs font-black text-[rgb(var(--green))]">
              ✓ Questions récupérées depuis le cache
            </span>
          )}
          {pdfStats.pageCount !== null && (
            <span className="text-sm text-[rgb(var(--ink-2))]">
              {pdfStats.pageCount} page(s) analysée(s)
            </span>
          )}
          <span className="text-sm text-[rgb(var(--ink-2))]">
            {pdfStats.questionCount} question(s) générée(s)
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/10 p-4 text-sm font-bold text-[rgb(var(--red))]">
          {error}
        </div>
      )}
    </div>
  );
}
