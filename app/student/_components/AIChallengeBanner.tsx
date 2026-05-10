export default function AIChallengeBanner() {
  return (
    <div className="rounded-2xl border border-purple-800/40 bg-purple-950/30 px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-purple-400">
            Défi IA
          </p>
          <p className="mt-0.5 text-sm font-semibold text-white">
            Questions personnalisées selon tes lacunes
          </p>
        </div>
        <button
          disabled
          className="shrink-0 rounded-xl bg-purple-800/50 px-4 py-2 text-sm font-bold text-purple-300 opacity-60 cursor-not-allowed"
        >
          Bientôt
        </button>
      </div>
    </div>
  );
}
