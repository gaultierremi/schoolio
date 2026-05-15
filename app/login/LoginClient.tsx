"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LoginClient() {
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const [loading, setLoading] = useState<null | "google">(null);
  const [error, setError] = useState<string | null>(null);

  function callbackUrl(): string {
    const base = `${window.location.origin}/auth/callback`;
    if (nextParam && nextParam.startsWith("/")) {
      return `${base}?next=${encodeURIComponent(nextParam)}`;
    }
    return base;
  }

  async function signIn(provider: "google") {
    setLoading(provider);
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(null);
    }
    // Sur succès, Supabase redirige vers la page de consent du provider.
  }

  return (
    <section className="w-full max-w-md rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 shadow-sm">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[rgb(var(--accent))] text-white text-2xl font-black select-none">
          M
        </div>
        <h1 className="serif text-2xl font-bold text-[rgb(var(--ink))]">
          Bienvenue sur Maïa
        </h1>
        <p className="text-sm text-[rgb(var(--ink-2))] text-center">
          Connecte-toi pour accéder à ton espace.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        <button
          type="button"
          onClick={() => signIn("google")}
          disabled={loading !== null}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-white px-5 py-3 text-sm font-bold text-[rgb(var(--ink))] transition hover:border-[rgb(var(--ink-3))] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          <GoogleIcon />
          {loading === "google" ? "Redirection…" : "Continuer avec Google"}
        </button>

        <button
          type="button"
          disabled
          title="Microsoft — bientôt disponible"
          aria-label="Microsoft, bientôt disponible"
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-5 py-3 text-sm font-bold text-[rgb(var(--ink-3))] opacity-60 cursor-not-allowed"
        >
          <MicrosoftIcon />
          Continuer avec Microsoft · Bientôt
        </button>

        <button
          type="button"
          disabled
          title="SmartSchool — bientôt disponible"
          aria-label="SmartSchool, bientôt disponible"
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-5 py-3 text-sm font-bold text-[rgb(var(--ink-3))] opacity-60 cursor-not-allowed"
        >
          <SmartSchoolIcon />
          Continuer avec SmartSchool · Bientôt
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/10 p-3 text-xs text-[rgb(var(--red))]">
          {error}
        </p>
      )}

      <p className="mt-6 text-center text-[11px] text-[rgb(var(--ink-3))]">
        En te connectant, tu acceptes notre traitement de tes données.{" "}
        <a
          href="/legal/dpia"
          className="underline hover:text-[rgb(var(--ink-2))]"
        >
          Détails
        </a>
        .
      </p>
    </section>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M16.51 8.84c0-.6-.05-1.18-.15-1.74H8.65v3.3h4.41c-.19 1.03-.77 1.9-1.65 2.49v2.07h2.66c1.56-1.43 2.46-3.55 2.46-6.12z" fill="#4285F4" />
      <path d="M8.65 17c2.23 0 4.1-.74 5.46-2l-2.66-2.07c-.74.5-1.69.79-2.8.79-2.15 0-3.97-1.45-4.62-3.4H1.27v2.13C2.62 14.99 5.42 17 8.65 17z" fill="#34A853" />
      <path d="M4.03 10.32a4.78 4.78 0 010-3.05V5.13H1.27a8.05 8.05 0 000 7.32l2.76-2.13z" fill="#FBBC04" />
      <path d="M8.65 4.4c1.21 0 2.3.42 3.16 1.23l2.36-2.36C12.74 1.96 10.87 1.2 8.65 1.2 5.42 1.2 2.62 3.21 1.27 5.95l2.76 2.13C4.68 5.86 6.5 4.4 8.65 4.4z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function SmartSchoolIcon() {
  // SmartSchool is not yet integrated — placeholder badge until brand assets land.
  return (
    <span
      aria-hidden="true"
      className="flex h-[18px] w-[18px] items-center justify-center rounded-md bg-slate-400 text-[10px] font-bold text-white"
    >
      S
    </span>
  );
}
