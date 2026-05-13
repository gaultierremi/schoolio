import { Flame } from "lucide-react";
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
        <h1 className="serif truncate text-2xl font-black text-[rgb(var(--ink))]">
          Bonjour {displayName} 👋
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[rgb(var(--ink-2))]">
          {className && <span className="truncate">{className}</span>}
          {className && streak > 0 && <span>·</span>}
          {streak > 0 && (
            <span className="flex items-center gap-1 font-semibold text-[rgb(var(--warm))]">
              <Flame className="h-4 w-4" aria-hidden />
              {streak} jour{streak > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
      <SignOutButton />
    </div>
  );
}
