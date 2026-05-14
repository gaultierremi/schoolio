"use client";

import { useState, useEffect, useRef } from "react";

type Preview = {
  class_name: string;
  teacher_name: string;
  level: string | null;
  student_count: number;
};

type Props = { initialCode?: string };

export default function JoinClassForm({ initialCode }: Props) {
  const [code, setCode] = useState((initialCode ?? "").toUpperCase());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-fetch preview when code is 8 chars
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPreview(null);
    setPreviewError("");

    if (code.length !== 8) return;

    debounceRef.current = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        const res = await fetch(`/api/join/preview?code=${encodeURIComponent(code)}`);
        const data = (await res.json()) as Preview & { error?: string };
        if (!res.ok) {
          setPreviewError(data.error ?? "Code invalide");
        } else {
          setPreview(data);
        }
      } catch {
        setPreviewError("Erreur réseau");
      } finally {
        setLoadingPreview(false);
      }
    }, 300);
  }, [code]);

  async function handleJoin() {
    if (!preview || joining) return;
    setJoining(true);
    setJoinError("");

    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        class_name?: string;
        already_member?: boolean;
        error?: string;
      };

      if (!res.ok) {
        setJoinError(data.error ?? "Erreur inconnue");
        setJoining(false);
        return;
      }

      // Force hard redirect to /student so session state refreshes.
      window.location.href = "/student";
    } catch {
      setJoinError("Erreur réseau, réessaie.");
      setJoining(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Code input */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[rgb(var(--ink-3))]">
          Code de classe
        </label>
        <input
          type="text"
          value={code}
          maxLength={8}
          autoComplete="off"
          autoFocus={!initialCode}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
            setJoinError("");
          }}
          placeholder="ABCD1234"
          className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-4 text-center font-mono text-2xl font-black tracking-[0.3em] text-[rgb(var(--ink))] outline-none transition focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/30"
        />
      </div>

      {loadingPreview && (
        <div className="flex items-center gap-2 text-xs text-[rgb(var(--ink-3))]">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-[rgb(var(--border))] border-t-[rgb(var(--accent))]" />
          Vérification…
        </div>
      )}

      {previewError && (
        <div className="rounded-xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/10 px-4 py-3 text-sm text-[rgb(var(--red))]">
          {previewError}
        </div>
      )}

      {preview && (
        <div className="rounded-xl border border-[rgb(var(--accent))]/30 bg-[rgb(var(--accent))]/5 px-4 py-4">
          <div>
            <p className="font-bold text-[rgb(var(--ink))]">{preview.class_name}</p>
            <p className="text-sm text-[rgb(var(--ink-2))]">
              Prof : {preview.teacher_name}
              {preview.level ? ` · ${preview.level}e` : ""}
            </p>
            <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">
              {preview.student_count} élève{preview.student_count !== 1 ? "s" : ""} inscrit{preview.student_count !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      )}

      {joinError && (
        <div className="rounded-xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/10 px-4 py-3 text-sm text-[rgb(var(--red))]">
          {joinError}
        </div>
      )}

      <button
        onClick={handleJoin}
        disabled={!preview || joining}
        className="w-full rounded-xl bg-[rgb(var(--accent))] py-4 text-base font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {joining ? "Inscription…" : "Rejoindre la classe →"}
      </button>
    </div>
  );
}
