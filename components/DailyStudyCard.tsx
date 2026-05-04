import Link from "next/link";
import { getDailyStudyPlan, getStudyStreak } from "@/lib/recommendations";

export default async function DailyStudyCard({ userId }: { userId: string }) {
  let plan = null;
  let streak = 0;

  try {
    [plan, streak] = await Promise.all([
      getDailyStudyPlan(userId),
      getStudyStreak(userId),
    ]);
  } catch {
    return null;
  }

  if (!plan) return null;

  const hasDue = plan.dueCount > 0;
  const hasAny = hasDue || plan.newCount > 0;

  if (!hasAny) {
    // All caught up — show a compact badge
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-green-800/50 bg-green-950/30 px-4 py-3">
        <span className="text-lg">✅</span>
        <p className="flex-1 text-sm font-medium text-green-300">
          Tu es à jour pour aujourd&apos;hui !
        </p>
        {streak > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-black text-orange-400">
            🔥 {streak}j
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4 sm:flex-row sm:items-center">
      <div className="flex-1">
        <div className="mb-1 flex items-center gap-2">
          <p className="text-sm font-black text-white">Révision du jour</p>
          {streak > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-black text-orange-400">
              🔥 {streak} jour{streak > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <p className="text-xs text-gray-400">
          {hasDue && (
            <span>
              <span className="font-bold text-purple-300">{plan.dueCount}</span>{" "}
              question{plan.dueCount > 1 ? "s" : ""} à réviser
            </span>
          )}
          {hasDue && plan.newCount > 0 && " · "}
          {plan.newCount > 0 && (
            <span>
              <span className="font-bold text-purple-300">{plan.newCount}</span>{" "}
              nouvelle{plan.newCount > 1 ? "s" : ""}
            </span>
          )}
          {" · "}
          <span>~{plan.estimatedMinutes} min</span>
        </p>

        {plan.concepts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {plan.concepts.map((c) => (
              <span
                key={c.id}
                className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-300"
              >
                {c.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <Link
        href="/study/review"
        className="shrink-0 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-purple-500 active:scale-95"
      >
        Commencer la révision →
      </Link>
    </div>
  );
}
