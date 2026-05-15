"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, ShieldCheck, Users } from "lucide-react";

/**
 * Consent RGPD — Sprint 1B : adulte OU workflow parent mineur.
 *
 * Flow :
 * - Date de naissance saisie
 * - Si ≥16 ans → checkbox adulte → POST /api/consent/give → redirect pin-setup
 * - Si <16 ans → sub-form email parent → POST /api/consent/request-parent
 *   → redirect /onboarding/consent-rgpd/en-attente (avec inline link fallback
 *   si l'envoi email a échoué — mémoire critique #6)
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
  const [parentEmail, setParentEmail] = useState("");
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

  const age = computeAgeYears(birthdate);
  const isMinor = age !== null && age >= 0 && age < 16;
  const isAdult = age !== null && age >= 16 && age <= 120;

  async function handleAdultSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
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

  async function handleMinorSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const emailTrim = parentEmail.trim();
    // Simple format check — pas une regex de paranoïa, juste filter typos.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setError("Saisis une adresse email valide pour ton parent.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/consent/request-parent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentEmail: emailTrim, birthdate, next: nextParam }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        inlineFallbackUrl?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Impossible d'envoyer la demande.");
        setSubmitting(false);
        return;
      }
      // L'API a peut-être renvoyé un inlineFallbackUrl si l'envoi mail a foiré.
      // On le passe au query string pour que la page d'attente l'affiche.
      const qs = data.inlineFallbackUrl
        ? `?inlineLink=${encodeURIComponent(data.inlineFallbackUrl)}`
        : "";
      router.push(`/onboarding/consent-rgpd/en-attente${qs}`);
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

        {/* Étape 1 : date de naissance — déterminé adulte vs mineur */}
        <div className="space-y-5">
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
                setAccept(false);
                setParentEmail("");
              }}
              className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
              Sert uniquement à vérifier que tu as ≥ 16 ans (Art. 8 RGPD).
            </p>
          </div>

          {/* Branche adulte ≥16 */}
          {isAdult && (
            <form onSubmit={handleAdultSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
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
                  et j&apos;accepte le traitement de mes données.
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
            </form>
          )}

          {/* Branche mineur <16 */}
          {isMinor && (
            <form onSubmit={handleMinorSubmit} className="space-y-5 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
              <div className="flex items-start gap-3 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
                <Users size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">
                    Tu as moins de 16 ans : l&apos;accord d&apos;un parent est requis (Art. 8 RGPD).
                  </p>
                  <p className="mt-1">
                    Saisis l&apos;email d&apos;un parent. On lui envoie un lien
                    pour qu&apos;il signe le consentement. Ton accès sera
                    débloqué dès qu&apos;il aura signé.
                  </p>
                  <p className="mt-2 text-xs">
                    L&apos;email parent n&apos;est jamais stocké en clair — il
                    est hashé immédiatement après l&apos;envoi.
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="parentEmail"
                  className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Email d&apos;un parent
                </label>
                <input
                  id="parentEmail"
                  type="email"
                  required
                  value={parentEmail}
                  onChange={(e) => {
                    setParentEmail(e.target.value);
                    setError(null);
                  }}
                  placeholder="parent@example.com"
                  className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

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
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                <Mail size={16} strokeWidth={1.75} />
                {submitting ? "Envoi…" : "Envoyer la demande à mon parent"}
              </button>
            </form>
          )}

          <p className="text-center text-xs leading-relaxed text-slate-500 dark:text-slate-500">
            Tu pourras à tout moment révoquer ce consentement et demander la
            suppression de ton compte depuis tes paramètres.
          </p>
        </div>
      </div>
    </main>
  );
}
