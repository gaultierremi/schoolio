"use client";

import { FileText, Eye, Sparkles, CheckCheck, AlertCircle, RotateCw } from "lucide-react";

type Job = {
  status: string;
  phase: string;
  text_chapters_total: number | null;
  text_chapters_completed: number;
  image_batches_total: number | null;
  image_batches_completed: number;
  questions_inserted: number | null;
  error_message: string | null;
};

type Step = "extraction" | "analyse" | "generation" | "validation";

const STEPS: { id: Step; label: string; Icon: typeof FileText }[] = [
  { id: "extraction", label: "Extraction", Icon: FileText },
  { id: "analyse", label: "Analyse", Icon: Eye },
  { id: "generation", label: "Génération", Icon: Sparkles },
  { id: "validation", label: "Validation", Icon: CheckCheck },
];

function activeStep(job: Job): Step | "error" {
  if (job.status === "failed") return "error";
  if (job.phase === "extracting_pdf") return "extraction";
  if (job.phase === "generating_workers" && !job.text_chapters_total) return "analyse";
  if (job.phase === "generating_workers" && job.text_chapters_total) return "generation";
  if (job.phase === "validating" || job.phase === "done") return "validation";
  return "extraction";
}

function cn(...c: (string | false | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

export function JobProgressStepper({ job, onRetry }: { job: Job; onRetry?: () => void }) {
  const active = activeStep(job);
  const isError = active === "error";

  function stateOf(step: Step): "done" | "active" | "todo" | "error" {
    if (isError) {
      if (job.phase === "extracting_pdf") return step === "extraction" ? "error" : "todo";
      if (job.phase === "generating_workers") {
        if (step === "extraction") return "done";
        if (step === "analyse") return job.text_chapters_total ? "done" : "error";
        if (step === "generation") return job.text_chapters_total ? "error" : "todo";
        return "todo";
      }
      return step === "validation" ? "error" : "done";
    }
    const order: Step[] = ["extraction", "analyse", "generation", "validation"];
    const aIdx = order.indexOf(active as Step);
    const sIdx = order.indexOf(step);
    if (sIdx < aIdx) return "done";
    if (sIdx === aIdx) return "active";
    return "todo";
  }

  function subInfo(step: Step): string | null {
    if (stateOf(step) !== "active") return null;
    if (step === "generation" && job.text_chapters_total) {
      const a = `${job.text_chapters_completed}/${job.text_chapters_total} chapitres`;
      const b = job.image_batches_total
        ? ` • ${job.image_batches_completed}/${job.image_batches_total} batches images`
        : "";
      return a + b;
    }
    if (step === "validation" && job.questions_inserted) {
      return `${job.questions_inserted} questions générées`;
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <ol className="flex items-center justify-between gap-2 sm:gap-4">
        {STEPS.map((s, i) => {
          const state = stateOf(s.id);
          return (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition",
                  state === "done" && "border-green-500 bg-green-500 text-white",
                  state === "active" && "border-violet-500 bg-violet-100 text-violet-700 animate-pulse",
                  state === "todo" && "border-gray-300 bg-white text-gray-400",
                  state === "error" && "border-red-500 bg-red-500 text-white",
                )}
              >
                <s.Icon className="h-4 w-4" />
              </div>
              <div className="hidden min-w-0 sm:block">
                <p
                  className={cn(
                    "text-sm font-medium",
                    state === "done" && "text-green-700",
                    state === "active" && "text-violet-700",
                    state === "todo" && "text-gray-400",
                    state === "error" && "text-red-700",
                  )}
                >
                  {s.label}
                </p>
                {subInfo(s.id) && (
                  <p className="truncate text-xs text-gray-500">{subInfo(s.id)}</p>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "ml-2 h-0.5 flex-1",
                    state === "done" ? "bg-green-500" : "bg-gray-200",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {isError && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900 dark:text-red-200">
              Il y a une erreur, veuillez réessayer
            </p>
            {job.error_message && (
              <p className="mt-1 line-clamp-2 text-xs text-red-700 dark:text-red-300">
                {job.error_message}
              </p>
            )}
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Réessayer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
