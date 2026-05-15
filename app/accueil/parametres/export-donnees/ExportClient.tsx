"use client";

import { useState } from "react";
import { Download, FileJson } from "lucide-react";

export default function ExportClient({ userEmail }: { userEmail: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch("/api/parametres/export", { method: "GET" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Impossible de générer l'export. Réessaie.");
        setDownloading(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `maia-export-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDownloading(false);
    } catch {
      setError("Erreur réseau. Réessaie.");
      setDownloading(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <FileJson size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Contenu du fichier
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400 list-disc pl-5">
              <li>Ton profil (prénom, pseudo, email, rôle, école)</li>
              <li>Tes classes (membre ou enseignées)</li>
              <li>Tes réponses aux devoirs et quiz</li>
              <li>Ta mastery par concept</li>
              <li>Tes consentements RGPD signés / révoqués</li>
              <li>Le journal d&apos;activité récent (connexions, PIN, consent)</li>
            </ul>
            {userEmail && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
                Compte : {userEmail}
              </p>
            )}
          </div>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        <Download size={16} strokeWidth={1.75} />
        {downloading ? "Génération…" : "Télécharger maia-export.json"}
      </button>

      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-500">
        Ce fichier ne contient que les données te concernant. Les contenus
        pédagogiques (cours, exercices, questions du prof) ne sont pas inclus
        car ils appartiennent au professeur qui les a créés.
      </p>
    </div>
  );
}
