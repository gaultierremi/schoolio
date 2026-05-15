"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

/**
 * Consent RGPD — Sprint 1A scope adulte uniquement (≥ 16 ans).
 *
 * Workflow mineur (parent consent par token) = Sprint 1B (mémoire
 * project_consent_parental_minor). Pour MVP dogfood, on bloque les <16 ans
 * avec un message clair "contacte pilotes@maia.app".
 */
export default function ConsentAdulteClient({
  nextParam,
  userEmail,
}: {
  nextParam: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [birthdate, setBirthdate] = useState("");
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function computeAgeYears(iso: string): number | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
    return age;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const age = computeAgeYears(birthdate);
    if (age === null || age < 0 || age > 120) {
      setError("Saisis une date de naissance valide.");
      return;
    }
    if (age < 16) {
      setError(
        "Tu as moins de 16 ans. Le workflow de consentement parental arrive en Sprint 1B. En attendant, contacte pilotes@maia.app pour t'inscrire.",
      );
      return;
    }
    if (!accept) {
      setError("Tu dois accepter la politique de confidentialité pour continuer.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/consent/give", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthdate, next: nextParam }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; redirectTo?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Impossible d'enregistrer le consentement.");
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
            <ShieldCheck size={24} strokeWidth={1.75} />
          </div>
          <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Tes données, ton accord
          </h1>
          <p className="text-center text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Avant de continuer, on a besoin de ton accord pour traiter tes
            données comme l&apos;explique notre politique de confidentialité.
          </p>
          {userEmail && (
            <p className="text-center text-xs text-slate-500 dark:text-slate-500">
              {userEmail}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="birthdate"
              className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Date de naissance
            </label>
            <input
              id="birthdate"
              type="date"
              required
              value={birthdate}
              onChange={(e) => {
                setBirthdate(e.target.value);
                setError(null);
              }}
              className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
              Sert uniquement à vérifier que tu as ≥ 16 ans (Art. 8 RGPD).
              Non partagée, anonymisable à la suppression du compte.
            </p>
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={accept}
              onChange={(e) => {
                setAccept(e.target.checked);
                setError(null);
              }}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
            />
            <span className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              J&apos;ai lu la{" "}
              <Link
                href="/legal/confidentialite"
                target="_blank"
                rel="noopener"
                className="font-medium text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400"
              >
                politique de confidentialité
              </Link>{" "}
              et j&apos;accepte le traitement de mes données par Maïa pour mon
              usage scolaire.
            </span>
          </label>

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
            {submitting ? "Enregistrement…" : "J'accepte et je continue"}
          </button>

          <p className="text-center text-xs leading-relaxed text-slate-500 dark:text-slate-500">
            Tu pourras à tout moment révoquer ce consentement et demander la
            suppression de ton compte depuis tes paramètres (Art. 7(3) +
            Art. 17 RGPD).
          </p>
        </form>
      </div>
    </main>
  );
}
