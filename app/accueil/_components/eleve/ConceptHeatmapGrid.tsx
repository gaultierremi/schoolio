"use client";

import { useState } from "react";
import type { ConceptBucket } from "@/lib/types/student-dashboard";

type Props = {
  concepts: ConceptBucket[];
  /** Si fourni, intercepte le click au lieu de naviguer. */
  onConceptClick?: (c: ConceptBucket) => void;
};

function masteryClass(v: number, attempts: number): string {
  if (attempts === 0) return "bg-[rgb(var(--surface-3))] text-[rgb(var(--ink-3))]";
  if (v < 40) return "bg-[rgb(239_68_68)] text-white";
  if (v < 55) return "bg-[rgb(251_146_60)] text-[rgb(17_24_39)]";
  if (v < 70) return "bg-[rgb(250_204_21)] text-[rgb(17_24_39)]";
  if (v < 85) return "bg-[rgb(132_204_22)] text-[rgb(17_24_39)]";
  return "bg-[rgb(34_197_94)] text-white";
}

function masteryLabel(v: number, attempts: number): string {
  if (attempts === 0) return "Pas encore vu";
  if (v < 40) return "à reprendre";
  if (v < 55) return "fragile";
  if (v < 70) return "en route";
  if (v < 85) return "solide";
  return "maîtrisé";
}

export default function ConceptHeatmapGrid({ concepts, onConceptClick }: Props) {
  const [hover, setHover] = useState<ConceptBucket | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  if (concepts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface-3))] px-5 py-8 text-center">
        <p className="text-sm text-[rgb(var(--ink-2))]">
          Pas encore de données — répond à un devoir pour voir tes points forts apparaître ici.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
        {concepts.map((c) => {
          const cls = masteryClass(c.mastery, c.attempts);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onConceptClick?.(c)}
              onMouseEnter={(e) => {
                setHover(c);
                setPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl p-2 transition-transform hover:scale-105 ${cls} ${
                c.priority ? "ring-2 ring-offset-2 ring-[rgb(239_68_68)] ring-offset-[rgb(var(--surface))] animate-pulse" : ""
              }`}
              aria-label={`${c.label} : ${c.mastery}% de maîtrise`}
            >
              <span className="text-2xl font-semibold leading-none">{c.mastery}%</span>
              <span className="mt-1 line-clamp-2 text-center text-[10px] font-medium leading-tight">
                {c.label}
              </span>
              {c.priority && (
                <span className="absolute right-1 top-1 text-[10px]" aria-hidden>
                  ⚡
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-[rgb(var(--ink-3))]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-[rgb(239_68_68)]" />à reprendre
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-[rgb(251_146_60)]" />fragile
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-[rgb(250_204_21)]" />en route
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-[rgb(132_204_22)]" />solide
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-[rgb(34_197_94)]" />maîtrisé
        </span>
      </div>

      {/* Tooltip */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 max-w-[260px] rounded-lg bg-[rgb(var(--ink))] px-3 py-2 text-xs text-[rgb(var(--surface))] shadow-lg"
          style={{ left: pos.x + 14, top: pos.y + 14 }}
        >
          <p className="mb-1 font-semibold">{hover.label}</p>
          <p>
            {hover.mastery}% — {masteryLabel(hover.mastery, hover.attempts)}
          </p>
          <p className="opacity-70">
            {hover.correct}/{hover.attempts} correctes
            {hover.last_seen && ` · vu ${relativeDate(hover.last_seen)}`}
          </p>
        </div>
      )}
    </div>
  );
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffDays = Math.floor((now - then) / 86400000);
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "hier";
  return `il y a ${diffDays} j`;
}
