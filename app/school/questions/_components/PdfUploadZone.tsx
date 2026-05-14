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
      <p className="text-gray-400">
        Dépose un PDF de cours et Maïa génère des questions avec détection
        automatique de la période historique.
      </p>

      {warning && !loading && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-300">
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
            ? "border-purple-500 bg-purple-500/5"
            : loading
            ? "cursor-default border-gray-800"
            : "border-gray-700 bg-gray-900 hover:border-purple-500/50"
        }`}
      >
        {loading ? (
          <>
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-purple-500" />
            <p className="mt-4 font-bold text-purple-400">Analyse en cours…</p>
            <div className="mt-4 w-full max-w-xs">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-center text-xs text-gray-500">{progress}%</p>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Cela peut prendre jusqu&apos;à 60 secondes
            </p>
          </>
        ) : (
          <>
            <span className="text-5xl">📄</span>
            <p className="mt-4 font-black text-white">Dépose ton PDF ici</p>
            <p className="mt-1 text-sm text-gray-500">
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
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3">
          {pdfStats.fromCache && (
            <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-black text-green-400">
              ✓ Questions récupérées depuis le cache
            </span>
          )}
          {pdfStats.pageCount !== null && (
            <span className="text-sm text-gray-400">
              {pdfStats.pageCount} page(s) analysée(s)
            </span>
          )}
          <span className="text-sm text-gray-400">
            {pdfStats.questionCount} question(s) générée(s)
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
