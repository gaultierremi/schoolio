"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

const CONFIRMATION_WORD = "SUPPRIMER";

export default function DeleteAccountClient({ userEmail }: { userEmail: string }) {
  const [accept, setAccept] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!accept) {
      setError("Coche la case de confirmation pour continuer.");
      return;
    }
    if (confirm.trim() !== CONFIRMATION_WORD) {
      setError(`Saisis exactement "${CONFIRMATION_WORD}" pour confirmer.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/parametres/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim().slice(0, 500) }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Erreur lors de la suppression. Réessaie ou contacte dpo@maia.app.");
        setSubmitting(false);
        return;
      }
      // SignOut global puis redirect landing
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "global" });
      window.location.href = "/?deleted=1";
    } catch {
      setError("Erreur réseau. Réessaie.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Disclaimer ce qui se passe */}
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">
            <p className="font-semibold">Ce qui sera fait :</p>
            <ul className="mt-2 space-y-1 list-disc pl-5 text-sm">
              <li>Ton accès à Maïa est révoqué immédiatement (signOut global).</li>
              <li>Ton profil (prénom, pseudo, email) est anonymisé dans la base.</li>
              <li>Ton code PIN est supprimé.</li>
              <li>Tes réponses aux quiz et sessions sont <strong>conservées de manière anonyme</strong> (impossible de te ré-identifier) — elles alimentent les statistiques agrégées de classe à des fins pédagogiques.</li>
              <li>Si tu te re-connectes plus tard avec le même compte Google, ce sera un nouveau compte vierge.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* What's preserved */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              Avant de supprimer, tu peux exporter tes données.
            </p>
            <p className="mt-1">
              RGPD Art. 20 droit à la portabilité — tu reçois un fichier JSON
              avec tout ce que Maïa a sur toi.
            </p>
            <a
              href="/accueil/parametres/export-donnees"
              className="mt-2 inline-block text-sm font-medium text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400"
            >
              Exporter mes données d&apos;abord →
            </a>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-red-200 bg-white p-5 dark:border-red-900/50 dark:bg-slate-900">
        {userEmail && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Compte concerné : <strong>{userEmail}</strong>
          </p>
        )}

        <div>
          <label htmlFor="reason" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Raison (facultatif)
          </label>
          <textarea
            id="reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Aide-nous à comprendre. Optionnel — la suppression marche aussi sans."
            className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500 dark:border-slate-700"
          />
          <span className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            Je comprends que cette action est <strong>irréversible</strong> et
            que mon compte sera immédiatement supprimé.
          </span>
        </label>

        <div>
          <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Saisis <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">{CONFIRMATION_WORD}</code> pour confirmer
          </label>
          <input
            id="confirm"
            type="text"
            autoComplete="off"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError(null);
            }}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm uppercase tracking-wider text-slate-900 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
          disabled={submitting || confirm.trim() !== CONFIRMATION_WORD || !accept}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
        >
          <Trash2 size={16} strokeWidth={1.75} />
          {submitting ? "Suppression…" : "Supprimer définitivement"}
        </button>
      </form>
    </div>
  );
}
