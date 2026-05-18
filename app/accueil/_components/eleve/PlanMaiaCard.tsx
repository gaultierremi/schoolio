"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Lightbulb, Loader2, Sparkles } from "lucide-react";

type PlanResponse = {
  ok: true;
  plan: {
    id: string;
    plan_date: string;
    question_ids: string[];
    reasons_by_question_id: Record<string, { bucket: string; reason: string }>;
    strategy?: string;
    estimated_minutes: number;
    target_minutes: number;
    generated_by: string;
    completed_count: number;
    completed_at: string | null;
  } | null;
  message?: string;
};

/**
 * Sprint 4 PR S4-1 — Card "Plan Maïa du jour" sur `/accueil` élève.
 *
 * Mémoire `project_plan_maia_daily` : 20 min multi-matière auto chaque matin.
 *
 * Lazy fetch côté client. Si plan existant → CTA "Démarrer". Si pas dispo
 * → message explicatif (pas de classes, pas de questions, etc.).
 *
 * MVP UI minimaliste : la complexité de l'algo + breakdown détaillé arrive
 * en PR S4-2 (UI complète) + S4-3 (batch cron nuit).
 *
 * A11y :
 * - `aria-busy` pendant fetch
 * - `role="status"` pour message vide / dispo
 * - Focus visible AA sur CTA
 * - motion-reduce sur spinner
 */
export default function PlanMaiaCard({ displayName }: { displayName: string }) {
  const [data, setData] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/student/plan-maia-daily");
        const json = (await res.json()) as PlanResponse | { ok: false; error: string };
        if (cancelled) return;
        if (!res.ok || !("ok" in json) || !json.ok) {
          setError("error" in json ? json.error : "Erreur de chargement");
          return;
        }
        setError(null);
        setData(json);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur réseau");
      }
    }
    void load();

    /**
     * I11 fix : re-fetch quand l'onglet redevient visible (élève revient
     * après avoir fait des questions ailleurs, ou jour qui change si onglet
     * resté ouvert toute la nuit). Sans ça, `completed_count` reste figé.
     */
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void load();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (error) {
    return (
      <article
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      >
        <p className="font-semibold">Plan du jour temporairement indisponible.</p>
        <p className="mt-1 text-xs">{error}</p>
      </article>
    );
  }

  if (data === null) {
    return (
      <article
        aria-busy="true"
        className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 dark:border-indigo-900 dark:bg-indigo-950/30"
      >
        <div className="flex items-center gap-3">
          <Loader2
            size={18}
            strokeWidth={2}
            aria-hidden="true"
            className="animate-spin text-indigo-500 motion-reduce:animate-none"
          />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Maïa prépare ton plan du jour…
          </p>
        </div>
      </article>
    );
  }

  // Cas : plan disponible
  if (data.plan) {
    const minutes = data.plan.estimated_minutes;
    const totalQuestions = data.plan.question_ids.length;
    const completed = data.plan.completed_count;
    const remaining = Math.max(0, totalQuestions - completed);
    const isFinished = data.plan.completed_at !== null;

    return (
      <article className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-5 shadow-sm dark:border-indigo-900 dark:from-indigo-950/40 dark:to-violet-950/40">
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"
          >
            <Sparkles size={18} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
              Plan Maïa du jour
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Bonjour {displayName} — ton plan est prêt
            </h2>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              {isFinished ? (
                <>
                  <strong>Plan terminé</strong> ✓ Reviens demain pour ton prochain plan.
                </>
              ) : (
                <>
                  <strong>{remaining} question{remaining > 1 ? "s" : ""}</strong> ·{" "}
                  ~{minutes} min · multi-matière équilibré
                </>
              )}
            </p>
            {!isFinished && completed > 0 ? (
              <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">
                Tu as déjà répondu à {completed} question{completed > 1 ? "s" : ""} aujourd&apos;hui.
              </p>
            ) : null}
          </div>
        </div>

        {!isFinished ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/accueil/plan-maia/today"
              className="
                inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2
                text-sm font-semibold text-white transition
                hover:bg-indigo-700
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-indigo-500 focus-visible:ring-offset-2
                focus-visible:ring-offset-white
                dark:focus-visible:ring-offset-slate-900
                motion-reduce:transition-none
              "
            >
              Démarrer
              <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
            </Link>
            <p className="text-[10px] italic text-slate-500 dark:text-slate-500">
              Plan généré automatiquement depuis tes lacunes — non-adaptatif au skip
            </p>
          </div>
        ) : null}
      </article>
    );
  }

  // Cas : pas de plan disponible (message explicatif)
  return (
    <article
      role="status"
      className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-start gap-3">
        <Lightbulb
          size={18}
          strokeWidth={2}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500"
        />
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Bonjour {displayName}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {data.message ??
              "Pas encore de plan personnalisé. Continue tes devoirs pour que Maïa apprenne ce qui te conviendrait."}
          </p>
        </div>
      </div>
    </article>
  );
}
