"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type Preview = {
  class_name: string;
  teacher_name: string;
  level: string | null;
  student_count: number;
};

type Props = { initialCode?: string };

export default function JoinClassForm({ initialCode }: Props) {
  const router = useRouter();
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

      // Success — force hard redirect to pick up new session/cookie state
      window.location.href = "/student";
    } catch {
      setJoinError("Erreur réseau, réessaie.");
      setJoining(false);
    }
  }

  async function handleGoogleLogin() {
    const supabase = createClient();
    const next = `/join${code ? `?code=${code}` : ""}`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  async function handleMicrosoftLogin() {
    const supabase = createClient();
    const next = `/join${code ? `?code=${code}` : ""}`;
    await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email profile openid",
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <div className="space-y-5">
      {/* Code input */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-400">
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
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-4 text-center font-mono text-2xl font-black tracking-[0.3em] text-white placeholder-zinc-600 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
        />
      </div>

      {/* Preview */}
      {loadingPreview && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-600 border-t-purple-400" />
          Vérification…
        </div>
      )}

      {previewError && (
        <div className="rounded-xl border border-red-800/40 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {previewError}
        </div>
      )}

      {preview && (
        <div className="rounded-xl border border-purple-800/40 bg-purple-950/20 px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">🏫</span>
            <div>
              <p className="font-bold text-white">{preview.class_name}</p>
              <p className="text-sm text-zinc-400">
                Prof : {preview.teacher_name}
                {preview.level ? ` · ${preview.level}e` : ""}
              </p>
              <p className="mt-0.5 text-xs text-zinc-600">
                {preview.student_count} élève{preview.student_count !== 1 ? "s" : ""} inscrit{preview.student_count !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Join error */}
      {joinError && (
        <div className="rounded-xl border border-red-800/40 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {joinError}
        </div>
      )}

      {/* Actions */}
      <button
        onClick={handleJoin}
        disabled={!preview || joining}
        className="w-full rounded-xl bg-purple-600 py-4 text-base font-black text-white transition hover:bg-purple-500 disabled:opacity-50"
      >
        {joining ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Inscription…
          </span>
        ) : (
          "Rejoindre la classe →"
        )}
      </button>

      <div className="relative flex items-center gap-3">
        <div className="flex-1 border-t border-zinc-800" />
        <span className="text-xs text-zinc-600">ou</span>
        <div className="flex-1 border-t border-zinc-800" />
      </div>

      <button
        onClick={handleGoogleLogin}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 py-3.5 text-sm font-bold text-white transition hover:border-zinc-600 hover:bg-zinc-800"
      >
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
          <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.49-1.63.78-2.7.78-2.08 0-3.84-1.4-4.47-3.29H1.85v2.07A8 8 0 0 0 8.98 17z"/>
          <path fill="#FBBC05" d="M4.51 10.54A4.8 4.8 0 0 1 4.26 9c0-.53.09-1.05.25-1.54V5.39H1.85A8 8 0 0 0 .98 9c0 1.29.31 2.51.87 3.61l2.66-2.07z"/>
          <path fill="#EA4335" d="M8.98 3.58c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 8.98 1a8 8 0 0 0-7.13 4.39l2.66 2.07c.63-1.89 2.39-3.28 4.47-3.28z"/>
        </svg>
        Se connecter avec Google
      </button>

      <button
        onClick={handleMicrosoftLogin}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 py-3.5 text-sm font-bold text-white transition hover:border-zinc-600 hover:bg-zinc-800"
      >
        <svg width="18" height="18" viewBox="0 0 21 21">
          <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
          <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
          <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
        </svg>
        Se connecter avec Microsoft
      </button>
    </div>
  );
}
