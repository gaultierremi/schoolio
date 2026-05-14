"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type JobStatus = "pending" | "running" | "done" | "failed";

type JobPhase =
  | "queued"
  | "extracting_pdf"
  | "generating_workers"
  | "validating"
  | "inserting_db"
  | "done"
  | "failed";

type JobStatusResponse = {
  status: JobStatus;
  phase: JobPhase;
  worker_count: number;
  workers_completed: number;
  questions_raw: number;
  questions_inserted: number;
  total_target: number;
  pages_count: number;
  started_at: string | null;
  phase_changed_at: string | null;
  completed_at: string | null;
  error_message: string | null;
};

type StepState = "done" | "active" | "waiting";

// ── Helpers ───────────────────────────────────────────────────────────────────

function phaseToActiveStep(phase: JobPhase): number {
  if (phase === "queued" || phase === "extracting_pdf") return 0;
  if (phase === "generating_workers") return 1;
  if (phase === "validating") return 2;
  if (phase === "inserting_db") return 3;
  return -1; // "done" or "failed" — all steps passed
}

function resolveStepState(stepIndex: number, activeStep: number, isAllDone: boolean): StepState {
  if (isAllDone || stepIndex < activeStep) return "done";
  if (stepIndex === activeStep) return "active";
  return "waiting";
}

function stepLabel(stepIndex: number, data: JobStatusResponse): string {
  switch (stepIndex) {
    case 0:
      return "Extraction PDF";
    case 1: {
      if (data.worker_count > 0) {
        return `Workers 1-${data.worker_count} en cours (${data.workers_completed}/${data.worker_count} terminés, ~${data.questions_raw} questions générées)`;
      }
      return "Génération workers";
    }
    case 2:
      return "Validation";
    case 3:
      return "Insertion DB";
    default:
      return "";
  }
}

const STEP_DEFAULT_LABELS = [
  "Extraction PDF",
  "Génération workers",
  "Validation",
  "Insertion DB",
] as const;

function formatEta(seconds: number): string {
  if (seconds <= 0) return "presque terminé…";
  if (seconds < 60) return `Reste ~${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `Reste ~${mins}min ${secs}s` : `Reste ~${mins}min`;
}

function computeEta(data: JobStatusResponse): string | null {
  if (!data.started_at) return null;
  const startedMs = new Date(data.started_at).getTime();
  if (Number.isNaN(startedMs)) return null;
  const expectedTotal = Math.max(60, data.pages_count * 0.7);
  const elapsed = (Date.now() - startedMs) / 1000;
  const remaining = expectedTotal - elapsed;
  return formatEta(remaining);
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function IconCheckCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function IconSpinner({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function IconCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
    </svg>
  );
}

// ── Step icon ─────────────────────────────────────────────────────────────────

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return <IconCheckCircle className="h-4 w-4 text-green-400 shrink-0" />;
  }
  if (state === "active") {
    return <IconSpinner className="h-4 w-4 text-violet-400 shrink-0 animate-spin" />;
  }
  return <IconCircle className="h-4 w-4 text-white/25 shrink-0" />;
}

function stepTextClass(state: StepState): string {
  if (state === "done") return "text-green-400 text-xs";
  if (state === "active") return "text-violet-300 text-xs";
  return "text-white/35 text-xs";
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  jobId: string;
  onComplete: (questionsInserted: number) => void;
  onError: (msg: string) => void;
};

export default function GenerationProgress({ jobId, onComplete, onError }: Props) {
  const [data, setData] = useState<JobStatusResponse | null>(null);

  // Keep callbacks stable across renders without restarting the interval
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    let stopped = false;

    async function poll() {
      try {
        const res = await fetch(`/api/courses/generate-questions/${jobId}/status`);
        if (!res.ok) return; // transient error — keep polling
        const json = (await res.json()) as JobStatusResponse;
        if (stopped) return;
        setData(json);

        if (json.status === "done") {
          stopped = true;
          onCompleteRef.current(json.questions_inserted);
        } else if (json.status === "failed") {
          stopped = true;
          onErrorRef.current(json.error_message ?? "Erreur de génération");
        }
      } catch {
        // network error — keep polling
      }
    }

    // Immediate first fetch, then every 2s
    void poll();
    const interval = setInterval(() => {
      if (!stopped) void poll();
      else clearInterval(interval);
    }, 2000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [jobId]);

  const STEP_COUNT = 4;
  const isAllDone = data?.phase === "done";
  const activeStep = data ? phaseToActiveStep(data.phase) : 0;
  const eta = data && !isAllDone ? computeEta(data) : null;

  return (
    <div className="flex flex-col gap-2 mt-2">
      {Array.from({ length: STEP_COUNT }, (_, i) => {
        const state = data ? resolveStepState(i, activeStep, isAllDone) : "waiting";
        const label = data ? stepLabel(i, data) : STEP_DEFAULT_LABELS[i];
        return (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-0.5">
              <StepIcon state={state} />
            </span>
            <span className={stepTextClass(state)}>{label}</span>
          </div>
        );
      })}

      {eta && (
        <p className="text-xs text-white/40 mt-1">{eta}</p>
      )}
    </div>
  );
}
