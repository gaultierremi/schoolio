import { Target } from "lucide-react";

export default function AIChallengeBanner() {
  return (
    <div className="rounded-2xl border border-[rgb(var(--accent))]/30 bg-[rgb(var(--accent-soft))]/30 px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Target className="h-5 w-5 shrink-0 text-[rgb(var(--accent))]" aria-hidden />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[rgb(var(--accent))]">
              Défi Maïa
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[rgb(var(--ink))]">
              Questions personnalisées selon tes lacunes
            </p>
          </div>
        </div>
        <button
          disabled
          className="shrink-0 rounded-xl bg-[rgb(var(--accent-soft))]/50 px-4 py-2 text-sm font-bold text-[rgb(var(--accent))] opacity-60 cursor-not-allowed"
        >
          Bientôt
        </button>
      </div>
    </div>
  );
}
