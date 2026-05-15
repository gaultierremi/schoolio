"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Send } from "lucide-react";

export default function SignClient({
  rawToken,
  studentName,
  expiresAt,
}: {
  rawToken: string;
  studentName: string;
  expiresAt: string;
}) {
  const [signerName, setSignerName] = useState("");
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (signerName.trim().length < 2) {
      setError("Veuillez saisir votre nom complet (parent signataire).");
      return;
    }
    if (!accept) {
      setError("Cochez la case pour confirmer le consentement.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/consent/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: rawToken,
          signerName: signerName.trim().slice(0, 200),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Impossible d'enregistrer le consentement.");
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setSubmitting(false);
    } catch {
      setError("Erreur réseau. Réessayez.");
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900/50 dark:bg-emerald-950/30">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 size={24} strokeWidth={1.75} />
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight text-emerald-900 dark:text-emerald-100">
          Merci !
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-emerald-900 dark:text-emerald-200">
          Le consentement est enregistré. <strong>{studentName}</strong> peut
          maintenant utiliser Maïa.
        </p>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 space-y-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Signature
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-500">
        Lien valide jusqu&apos;au{" "}
        {new Date(expiresAt).toLocaleString("fr-BE", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
        .
      </p>

      <div>
        <label
          htmlFor="signerName"
          className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Votre nom complet (parent / tuteur légal)
        </label>
        <input
          id="signerName"
          type="text"
          required
          maxLength={200}
          value={signerName}
          onChange={(e) => {
            setSignerName(e.target.value);
            setError(null);
          }}
          className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
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
          En cochant cette case, je consens au traitement par Maïa des données
          de <strong>{studentName}</strong>, conformément à la politique de
          confidentialité, et confirme être le titulaire de l&apos;autorité
          parentale.
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
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        <Send size={16} strokeWidth={1.75} />
        {submitting ? "Signature…" : "Signer le consentement"}
      </button>
    </form>
  );
}
