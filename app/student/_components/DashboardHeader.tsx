import SignOutButton from "./SignOutButton";

type Props = {
  displayName: string;
  className: string | null;
  streak: number;
};

export default function DashboardHeader({ displayName, className, streak }: Props) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-black text-white">
          Bonjour {displayName} 👋
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
          {className && <span className="truncate">{className}</span>}
          {className && streak > 0 && <span>·</span>}
          {streak > 0 && (
            <span className="flex items-center gap-1 font-semibold text-orange-400">
              🔥 {streak} jour{streak > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
      <SignOutButton />
    </div>
  );
}
