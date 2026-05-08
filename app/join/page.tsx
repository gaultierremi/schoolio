"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ValidateCodeResponse = {
  classId: string;
  className: string;
  authMode: "full" | "light";
  inviteLinkToken: string;
  teacherName?: string;
};

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError("Le code doit contenir exactement 6 caractères");
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch("/api/classes/validate-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: trimmed }),
    });

    const json = (await res.json()) as ValidateCodeResponse & {
      error?: string;
    };

    if (!res.ok) {
      setError(json.error ?? "Code invalide");
      setLoading(false);
      return;
    }

    router.push(`/join/${json.inviteLinkToken}`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-5xl">🎒</p>
          <h1 className="mt-4 text-3xl font-black text-white">
            Rejoindre une classe
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Entre le code donné par ton professeur
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-gray-800 bg-gray-900 p-6 shadow-xl shadow-black/20"
        >
          <label
            htmlFor="code"
            className="block text-sm font-bold text-gray-200"
          >
            Code de classe
          </label>
          <input
            id="code"
            type="text"
            value={code}
            maxLength={6}
            autoComplete="off"
            autoFocus
            disabled={loading}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            placeholder="ABCD12"
            className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-center font-mono text-xl font-black tracking-[0.35em] text-white outline-none transition-colors placeholder:text-gray-700 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          />

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading || code.trim().length !== 6}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-500 px-5 py-3.5 font-black text-gray-950 transition-colors hover:bg-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-950/30 border-t-gray-950" />
                Vérification...
              </>
            ) : (
              "Continuer →"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
