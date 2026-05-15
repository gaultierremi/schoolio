"use client";

import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

/**
 * Setup PIN à 4 chiffres après 1er SSO (Sprint 1A — design system MASTER).
 *
 * UX :
 * - 4 inputs séparés pour le PIN (focus auto sur la suivante au tap)
 * - 4 inputs séparés pour la confirmation
 * - Validation : 4 chiffres identiques entre PIN et confirm
 * - Capture timezone IANA via Intl.DateTimeFormat()
 * - POST /api/auth/pin/setup → set cookie + redirect
 *
 * Conforme mémoire `project_pin_auth_spec` : PIN 4 chiffres, mémoire bcrypt
 * côté serveur, jamais le PIN en clair côté client après submit.
 */
export default function PinSetupClient({
  nextParam,
  userEmail,
}: {
  nextParam: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  const [confirm, setConfirm] = useState<string[]>(["", "", "", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);
  const confirmRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);

  function handleDigitChange(
    target: "pin" | "confirm",
    index: number,
    value: string,
  ) {
    // Accept only digits, take last char if multi-char paste
    const digit = value.replace(/\D/g, "").slice(-1);
    const arr = target === "pin" ? [...pin] : [...confirm];
    arr[index] = digit;
    if (target === "pin") setPin(arr);
    else setConfirm(arr);
    if (digit && index < 3) {
      const refs = target === "pin" ? pinRefs : confirmRefs;
      refs.current[index + 1]?.focus();
    }
    setError(null);
  }

  function handleKeyDown(
    target: "pin" | "confirm",
    index: number,
    e: KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace") {
      const arr = target === "pin" ? pin : confirm;
      if (!arr[index] && index > 0) {
        const refs = target === "pin" ? pinRefs : confirmRefs;
        refs.current[index - 1]?.focus();
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const pinStr = pin.join("");
    const confirmStr = confirm.join("");

    if (pinStr.length !== 4) {
      setError("Saisis les 4 chiffres de ton PIN.");
      return;
    }
    if (confirmStr.length !== 4) {
      setError("Re-saisis les 4 chiffres pour confirmer.");
      return;
    }
    if (pinStr !== confirmStr) {
      setError("Les deux saisies ne correspondent pas.");
      setConfirm(["", "", "", ""]);
      confirmRefs.current[0]?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Brussels";
      const res = await fetch("/api/auth/pin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinStr, timezone, next: nextParam }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; redirectTo?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Impossible de configurer le PIN. Réessaie.");
        setSubmitting(false);
        return;
      }
      router.push(data.redirectTo ?? nextParam);
    } catch {
      setError("Erreur réseau. Réessaie.");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12">
      <div className="w-full">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300">
            <KeyRound size={24} strokeWidth={1.75} />
          </div>
          <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Configure ton code PIN
          </h1>
          <p className="text-center text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Tu n&apos;auras pas à te reconnecter chaque jour : ton PIN à 4 chiffres
            te suffira pour revenir sur Maïa.
          </p>
          {userEmail && (
            <p className="text-center text-xs text-slate-500 dark:text-slate-500">
              Compte : {userEmail}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <DigitGroup
            label="Choisis un PIN"
            value={pin}
            inputRefs={pinRefs}
            onChange={(i, v) => handleDigitChange("pin", i, v)}
            onKeyDown={(i, e) => handleKeyDown("pin", i, e)}
            autoFocus
          />

          <DigitGroup
            label="Re-saisis pour confirmer"
            value={confirm}
            inputRefs={confirmRefs}
            onChange={(i, v) => handleDigitChange("confirm", i, v)}
            onKeyDown={(i, e) => handleKeyDown("confirm", i, e)}
          />

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {submitting ? "Configuration…" : "Valider mon PIN"}
          </button>

          <p className="text-center text-xs leading-relaxed text-slate-500 dark:text-slate-500">
            Ton PIN est chiffré côté serveur (bcrypt). Personne, pas même
            l&apos;équipe Maïa, ne peut le lire. Si tu l&apos;oublies, tu pourras
            le réinitialiser via &laquo; PIN oublié &raquo; sur la page suivante.
          </p>
        </form>
      </div>
    </main>
  );
}

function DigitGroup({
  label,
  value,
  inputRefs,
  onChange,
  onKeyDown,
  autoFocus,
}: {
  label: string;
  value: string[];
  inputRefs: React.MutableRefObject<Array<HTMLInputElement | null>>;
  onChange: (index: number, value: string) => void;
  onKeyDown: (index: number, e: KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <div className="flex gap-3" role="group" aria-label={label}>
        {[0, 1, 2, 3].map((i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={`Chiffre ${i + 1} sur 4`}
            maxLength={1}
            value={value[i]}
            autoFocus={autoFocus && i === 0}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            className="h-14 w-full rounded-lg border border-slate-300 bg-white text-center text-2xl font-semibold text-slate-900 transition focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
          />
        ))}
      </div>
    </div>
  );
}
