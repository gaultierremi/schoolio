"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from "lucide-react";

type JobStatus = "pending" | "extracting" | "chunking" | "batching" | "storing" | "done" | "failed";

type StatusResponse = {
  jobId: string;
  status: JobStatus;
  programId: string;
  triggeredAt: string;
  startedAt: string | null;
  completedAt: string | null;
  batchId: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  theoryBlocksCount: number;
};

const STEPS: { key: JobStatus; label: string }[] = [
  { key: "pending", label: "En file d'attente" },
  { key: "extracting", label: "Extraction du PDF" },
  { key: "chunking", label: "Découpage par UAA" },
  { key: "batching", label: "Génération par Maïa (batch Anthropic)" },
  { key: "storing", label: "Enregistrement en base" },
  { key: "done", label: "Terminé" },
];

const POLL_INTERVAL_MS = 5_000;
const ORPHAN_THRESHOLD_MS = 6 * 60 * 1000; // 6 min — past Vercel's 5-min maxDuration

const IN_FLIGHT_STATUSES: JobStatus[] = [
  "pending",
  "extracting",
  "chunking",
  "batching",
  "storing",
];

type Props = {
  jobId: string;
  initialStatus: JobStatus;
  programId: string;
};

export default function StatusClient({ jobId, initialStatus, programId }: Props) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function tick() {
      try {
        const res = await fetch(`/api/ingestion/${jobId}`, { cache: "no-store" });
        const json = (await res.json()) as StatusResponse & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Erreur lors du chargement du statut");
        if (alive) setData(json);
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
    }

    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [jobId]);

  const status = data?.status ?? initialStatus;
  const currentStepIndex = STEPS.findIndex((s) => s.key === status);
  const isDone = status === "done";
  const isFailed = status === "failed";

  // Show resume button when the job appears orphaned: in-flight status and
  // started_at > 6 min ago (past Vercel's 5-min maxDuration, so the serverless
  // is certainly dead). pending with no started_at uses triggeredAt as fallback.
  const isOrphaned = (() => {
    if (!IN_FLIGHT_STATUSES.includes(status)) return false;
    const ref = data?.startedAt ?? data?.triggeredAt ?? null;
    if (!ref) return false;
    return Date.now() - new Date(ref).getTime() > ORPHAN_THRESHOLD_MS;
  })();

  async function handleResume() {
    setResuming(true);
    setResumeError(null);
    try {
      const res = await fetch(`/api/ingestion/${jobId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fast: true }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Echec de la reprise");
    } catch (err) {
      setResumeError((err as Error).message);
    } finally {
      setResuming(false);
    }
  }

  return (
    <main className="min-h-screen bg-[rgb(var(--surface-2))] px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/accueil" className="inline-flex items-center gap-2 text-sm text-[rgb(var(--ink-3))] hover:text-[rgb(var(--ink-2))]">
          <ArrowLeft className="h-4 w-4" />
          Espace prof
        </Link>

        <h1 className="serif mt-4 text-3xl font-bold text-[rgb(var(--ink))]">
          {isDone ? "Ingestion terminée" : isFailed ? "Ingestion échouée" : "Ingestion en cours"}
        </h1>
        <p className="mt-2 text-sm text-[rgb(var(--ink-2))]">
          Job ID : <code className="rounded bg-[rgb(var(--surface-3))] px-1.5 py-0.5 text-xs">{jobId}</code>
        </p>

        {/* Step list */}
        <ol className="mt-8 space-y-2 rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
          {STEPS.map((step, idx) => {
            const isCurrent = idx === currentStepIndex && !isFailed;
            const isPast = idx < currentStepIndex || isDone;
            const isFuture = idx > currentStepIndex && !isDone;
            const isFailedStep = isFailed && idx === currentStepIndex;

            return (
              <li key={step.key} className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                  {isFailedStep ? (
                    <XCircle className="h-5 w-5 text-[rgb(var(--red))]" />
                  ) : isPast ? (
                    <CheckCircle2 className="h-5 w-5 text-[rgb(var(--green))]" />
                  ) : isCurrent ? (
                    <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--accent))]" />
                  ) : (
                    <Clock className="h-4 w-4 text-[rgb(var(--ink-3))]" />
                  )}
                </span>
                <span
                  className={`text-sm ${
                    isCurrent
                      ? "font-bold text-[rgb(var(--ink))]"
                      : isPast
                      ? "text-[rgb(var(--ink))]"
                      : isFailedStep
                      ? "font-bold text-[rgb(var(--red))]"
                      : "text-[rgb(var(--ink-3))]"
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Progress / counters */}
        {data && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Counter label="Concepts" value={(data.metadata?.concepts as number) ?? "—"} />
            <Counter label="Paragraphes" value={data.theoryBlocksCount} />
            <Counter label="Mode" value={data.batchId ? "batch" : "fast"} />
          </div>
        )}

        {/* Orphaned job : resume button (shown after 6 min in-flight) */}
        {isOrphaned && (
          <div className="mt-4 rounded-2xl border border-[rgb(var(--accent))]/30 bg-[rgb(var(--accent))]/5 p-4">
            <p className="text-sm font-bold text-[rgb(var(--ink))]">Le job semble bloqué</p>
            <p className="mt-1 text-xs text-[rgb(var(--ink-2))]">
              Le serveur a probablement atteint la limite de 5 min de Vercel. Vous pouvez relancer
              le job — la pipeline est idempotente (pas de doublons).
            </p>
            {resumeError && (
              <p className="mt-2 text-xs text-[rgb(var(--red))]">{resumeError}</p>
            )}
            <button
              type="button"
              onClick={handleResume}
              disabled={resuming}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--accent))] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[rgb(var(--accent-2))] disabled:opacity-50"
            >
              {resuming ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {resuming ? "Reprise en cours…" : "Reprendre le job"}
            </button>
          </div>
        )}

        {/* Failed : error message + retry hint */}
        {isFailed && data?.errorMessage && (
          <div className="mt-4 rounded-2xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/5 p-4">
            <p className="text-sm font-bold text-[rgb(var(--red))]">Erreur</p>
            <p className="mt-1 text-xs text-[rgb(var(--ink-2))]">
              <code className="block whitespace-pre-wrap break-words">{data.errorMessage}</code>
            </p>
            <Link
              href="/school/syllabus/upload"
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-white px-3 py-1.5 text-xs font-bold text-[rgb(var(--ink))] transition hover:border-[rgb(var(--ink-3))]"
            >
              Relancer un upload <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        {/* Done : curation CTA */}
        {isDone && (
          <div className="mt-4 rounded-2xl border border-[rgb(var(--green))]/30 bg-[rgb(var(--green))]/5 p-4">
            <p className="text-sm font-bold text-[rgb(var(--ink))]">
              {data?.theoryBlocksCount ?? 0} paragraphes générés. Place à la curation.
            </p>
            <p className="mt-1 text-xs text-[rgb(var(--ink-2))]">
              Sprint 2 ajoutera l'UI de curation. Pour l'instant, vérifie en base via Supabase Studio.
            </p>
            <Link
              href="/accueil"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--accent))] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[rgb(var(--accent-2))]"
            >
              Retour <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        {error && !data && (
          <p className="mt-4 rounded-2xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))]/5 p-3 text-sm text-[rgb(var(--red))]">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

function Counter({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-center">
      <p className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--ink-3))]">{label}</p>
      <p className="serif mt-1 text-2xl font-bold text-[rgb(var(--ink))]">{value}</p>
    </div>
  );
}
