"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileUp, Loader2, Plus } from "lucide-react";
import type { Program } from "./page";

type Props = {
  programs: Program[];
  schoolId: string;
};

export default function UploadClient({
  programs: initialPrograms,
}: Props) {
  const router = useRouter();
  const [programs] = useState(initialPrograms);
  const [selectedProgramId, setSelectedProgramId] = useState<string>(
    programs[0]?.id ?? "",
  );
  const [file, setFile] = useState<File | null>(null);
  const [fast, setFast] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPrograms = programs.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Sélectionne un PDF.");
      return;
    }
    if (!selectedProgramId) {
      setError("Sélectionne un programme.");
      return;
    }

    setUploading(true);
    try {
      // Step 1 — upload PDF
      const form = new FormData();
      form.append("pdf", file);
      form.append("programId", selectedProgramId);
      const upRes = await fetch("/api/syllabus/upload", {
        method: "POST",
        body: form,
      });
      const upJson = (await upRes.json()) as {
        path?: string;
        sha256?: string;
        error?: string;
      };
      if (!upRes.ok || !upJson.path) {
        throw new Error(upJson.error ?? "Échec de l'upload");
      }

      // Step 2 — trigger ingestion
      const trigRes = await fetch("/api/ingestion/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: selectedProgramId,
          pdfStoragePath: upJson.path,
          pdfSha256: upJson.sha256,
          fast,
        }),
      });
      const trigJson = (await trigRes.json()) as {
        jobId?: string;
        error?: string;
      };
      if (!trigRes.ok || !trigJson.jobId) {
        throw new Error(trigJson.error ?? "Échec du lancement de l'ingestion");
      }

      // Step 3 — redirect to status page (T10)
      router.push(`/school/ingestion/${trigJson.jobId}`);
    } catch (err) {
      setError((err as Error).message);
      setUploading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        {/* Back link */}
        <a
          href="/school"
          className="inline-flex items-center gap-2 text-sm text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Espace prof
        </a>

        {/* Heading */}
        <h1 className="serif mt-4 text-3xl font-bold text-[rgb(var(--ink))]">
          Ajouter un syllabus
        </h1>
        <p className="mt-2 text-sm text-[rgb(var(--ink-2))]">
          Upload un PDF officiel FW-B. Maïa extrait les concepts et génère la
          théorie ; tu valides ensuite via la curation. Environ 5–15 min pour un
          syllabus complet.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-6 rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8"
        >
          {/* ── No programs state ─────────────────────────────────────────────── */}
          {!hasPrograms && (
            <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-5">
              <div className="flex items-start gap-3">
                <Plus className="h-5 w-5 shrink-0 text-[rgb(var(--accent))]" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[rgb(var(--ink))]">
                    Aucun programme disponible
                  </p>
                  <p className="mt-1 text-xs text-[rgb(var(--ink-2))]">
                    Sprint 1 dogfood&nbsp;: insère un programme via Supabase
                    Studio dans la table{" "}
                    <code className="rounded bg-[rgb(var(--surface-3))] px-1 py-0.5 text-xs">
                      curriculum_programs
                    </code>{" "}
                    avant le premier upload. Sprint 2 ajoutera l'UI de création
                    complète.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Program selector ─────────────────────────────────────────────── */}
          {hasPrograms && (
            <div>
              <label
                htmlFor="program-select"
                className="block text-sm font-bold text-[rgb(var(--ink-2))]"
              >
                Programme
              </label>
              <select
                id="program-select"
                value={selectedProgramId}
                onChange={(e) => setSelectedProgramId(e.target.value)}
                disabled={uploading}
                className="mt-2 w-full rounded-xl border border-[rgb(var(--border))] bg-white px-4 py-3 text-sm text-[rgb(var(--ink))] outline-none focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/20 disabled:opacity-60"
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name} — {p.level} — {p.subject}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── File picker + fast mode + submit (only when programs exist) ──── */}
          {hasPrograms && (
            <>
              {/* File picker */}
              <div>
                <label
                  htmlFor="pdf-input"
                  className="block text-sm font-bold text-[rgb(var(--ink-2))]"
                >
                  Syllabus PDF{" "}
                  <span className="font-normal text-[rgb(var(--ink-3))]">
                    (50 MB max)
                  </span>
                </label>
                <input
                  id="pdf-input"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={uploading}
                  className="mt-2 w-full rounded-xl border border-[rgb(var(--border))] bg-white px-4 py-3 text-sm text-[rgb(var(--ink))] file:mr-3 file:rounded-lg file:border-0 file:bg-[rgb(var(--accent))] file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-white disabled:opacity-60"
                />
                {file && (
                  <p className="mt-2 text-xs text-[rgb(var(--ink-3))]">
                    {file.name} —{" "}
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>

              {/* Fast mode toggle */}
              <div>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={fast}
                    onChange={(e) => setFast(e.target.checked)}
                    disabled={uploading}
                    className="mt-0.5 accent-[rgb(var(--accent))]"
                  />
                  <span>
                    <span className="font-bold text-[rgb(var(--ink))]">
                      Mode rapide
                    </span>
                    <span className="ml-2 text-xs text-[rgb(var(--ink-3))]">
                      Skip batch Anthropic — appels synchrones, plus rapide
                      mais environ 2× plus cher. Recommandé pour le dogfood.
                    </span>
                  </span>
                </label>
              </div>

              {/* Error banner */}
              {error && (
                <p
                  role="alert"
                  className="rounded-2xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/5 p-3 text-sm text-[rgb(var(--red))]"
                >
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={uploading || !file}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[rgb(var(--accent))] px-5 py-3 text-sm font-bold text-white transition hover:bg-[rgb(var(--accent-2))] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Lancement en cours&hellip;
                  </>
                ) : (
                  <>
                    <FileUp className="h-4 w-4" />
                    Lancer l&apos;ingestion
                  </>
                )}
              </button>
            </>
          )}
        </form>
      </div>
    </main>
  );
}
