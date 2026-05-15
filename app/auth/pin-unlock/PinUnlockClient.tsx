"use client";

import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

/**
 * Re-auth quotidienne PIN (Sprint 1A — design system MASTER).
 *
 * UX :
 * - 4 inputs séparés focus-auto
 * - Compteur d'échecs côté serveur (failed_attempts dans user_pin)
 * - À 3 échecs : lockout → signOut + redirect /login (l'utilisateur devra
 *   refaire un SSO complet puis setup nouveau PIN)
 * - Bouton "PIN oublié" → DELETE user_pin row + signOut + redirect /login
 */
export default function PinUnlockClient({
  nextParam,
  userEmail,
}: {
  nextParam: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const pinRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const arr = [...pin];
    arr[index] = digit;
    setPin(arr);
    if (digit && index < 3) pinRefs.current[index + 1]?.focus();
    setError(null);
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const pinStr = pin.join("");
    if (pinStr.length !== 4) {
      setError("Saisis les 4 chiffres de ton PIN.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinStr, next: nextParam }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        lockedOut?: boolean;
        attemptsLeft?: number;
        redirectTo?: string;
        error?: string;
      };

      if (data.lockedOut) {
        // 3 échecs atteints → signout global et redirect login
        const supabase = createClient();
        await supabase.auth.signOut({ scope: "global" });
        router.push("/login?error=pin_lockout");
        return;
      }

      if (!data.ok) {
        setError(data.error ?? "PIN incorrect.");
        if (typeof data.attemptsLeft === "number") setAttemptsLeft(data.attemptsLeft);
        setPin(["", "", "", ""]);
        pinRefs.current[0]?.focus();
        setSubmitting(false);
        return;
      }

      router.push(data.redirectTo ?? nextParam);
    } catch {
      setError("Erreur réseau. Réessaie.");
      setSubmitting(false);
    }
  }

  async function handleForgotPin() {
    if (!confirm("Tu vas être déconnecté et devras te reconnecter via Google puis configurer un nouveau PIN. Continuer ?")) {
      return;
    }
    setSubmitting(true);
    try {
      await fetch("/api/auth/pin", { method: "DELETE" });
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "global" });
      router.push("/login");
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12">
      <div className="w-full">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300">
            <Lock size={24} strokeWidth={1.75} />
          </div>
          <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Saisis ton PIN
          </h1>
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Ton code à 4 chiffres pour reprendre.
          </p>
          {userEmail && (
            <p className="text-center text-xs text-slate-500 dark:text-slate-500">
              {userEmail}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex gap-3" role="group" aria-label="Code PIN">
            {[0, 1, 2, 3].map((i) => (
              <input
                key={i}
                ref={(el) => {
                  pinRefs.current[i] = el;
                }}
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                aria-label={`Chiffre ${i + 1} sur 4`}
                maxLength={1}
                value={pin[i]}
                autoFocus={i === 0}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="h-14 w-full rounded-lg border border-slate-300 bg-white text-center text-2xl font-semibold text-slate-900 transition focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
              />
            ))}
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
            >
              {error}
              {attemptsLeft !== null && attemptsLeft > 0 && (
                <span className="ml-1 font-medium">
                  {attemptsLeft} essai{attemptsLeft > 1 ? "s" : ""} restant{attemptsLeft > 1 ? "s" : ""}.
                </span>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {submitting ? "Vérification…" : "Déverrouiller"}
          </button>

          <button
            type="button"
            onClick={handleForgotPin}
            disabled={submitting}
            className="block w-full text-center text-xs text-slate-500 underline transition hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
          >
            PIN oublié ?
          </button>
        </form>
      </div>
    </main>
  );
}
