import Avatar, { getLevelInfo } from "@/components/Avatar";
import type { UserStats } from "@/lib/profile";

function LevelBadge({ totalGames }: { totalGames: number }) {
  const { color, label } = getLevelInfo(totalGames);
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: `${color}25`, color }}
    >
      {label}
    </span>
  );
}

export default function UserProfileCard({ stats }: { stats: UserStats }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <Avatar profile={stats} totalGames={stats.total_games} size="lg" />

      <div className="min-w-0 flex-1">
        {/* Name + level */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-base font-bold text-white">{stats.user_name}</span>
          <LevelBadge totalGames={stats.total_games} />
        </div>

        {/* Stats row */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>
            🎮 <span className="font-semibold text-gray-300">{stats.total_games}</span> parties
          </span>
          <span>
            🔥 <span className="font-semibold text-gray-300">{stats.streak}</span> jours
          </span>
          {stats.global_rank !== null && (
            <span>
              🏆 <span className="font-semibold text-gray-300">#{stats.global_rank}</span> global
            </span>
          )}
          {stats.best_score > 0 && (
            <span>
              ⭐ <span className="font-semibold text-gray-300">{stats.best_score}</span> pts
            </span>
          )}
        </div>

        {/* Favorite mode badge */}
        {stats.favorite_mode && (
          <div className="mt-2">
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
              {stats.favorite_mode}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
